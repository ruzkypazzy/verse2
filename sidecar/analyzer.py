"""VERSE2 audio analysis: tempo, beat grid, energy curve, structure segmentation.

Primary segmentation follows the McFee & Ellis Laplacian spectral-clustering approach
from the librosa gallery (recurrence on beat-synced chroma combined with an MFCC path
affinity). If clustering degenerates (too few beats, silent audio, single cluster), we
fall back to energy/novelty boundary detection.

Section labels (intro/verse/chorus/bridge/outro) are heuristic: position, per-segment
RMS energy, and cluster repetition. All numbers in the output are computed — nothing
here touches an LLM.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass

import numpy as np
import librosa
import scipy
import sklearn.cluster

MIN_SEGMENT_SEC = 7.0
ENERGY_CURVE_HZ = 2.0  # resolution of the exported energy curve


@dataclass
class Segment:
    start: float
    end: float
    cluster: int
    energy: float = 0.0
    label: str = ""
    label_index: int = 0  # verse 1 vs verse 2, chorus 1 vs 2 ...

    @property
    def duration(self) -> float:
        return self.end - self.start


def _beat_sync_features(y: np.ndarray, sr: int):
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    tempo = float(np.atleast_1d(tempo)[0])
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    rms = librosa.feature.rms(y=y)
    # pad beat frames with start/end so segments cover the whole track
    beats = librosa.util.fix_frames(beats, x_min=0, x_max=chroma.shape[1] - 1)
    chroma_sync = librosa.util.sync(chroma, beats, aggregate=np.median)
    mfcc_sync = librosa.util.sync(mfcc, beats, aggregate=np.mean)
    rms_sync = librosa.util.sync(rms, beats, aggregate=np.mean)
    beat_times = librosa.frames_to_time(beats, sr=sr)
    return tempo, beats, beat_times, chroma_sync, mfcc_sync, rms_sync


def _structure_features(chroma_sync, mfcc_sync):
    """Chroma + z-scored MFCC: harmony alone cannot separate sections that share a chord
    loop but differ in instrumentation (piano-only intro vs full-band chorus), which is
    common in real songs."""
    mfcc_z = (mfcc_sync - mfcc_sync.mean(axis=1, keepdims=True)) / (
        mfcc_sync.std(axis=1, keepdims=True) + 1e-9
    )
    return np.vstack([chroma_sync, 0.5 * mfcc_z])


def _laplacian_cluster(feats, mfcc_sync, k, smooth_beats=9):
    """Cluster beats into k structural groups (librosa Laplacian segmentation)."""
    R = librosa.segment.recurrence_matrix(feats, width=3, mode="affinity", sym=True)
    # median-filter the recurrence matrix along diagonals to suppress noise
    df = librosa.segment.timelag_filter(scipy.ndimage.median_filter)
    Rf = df(R, size=(1, 7))

    # local timbre path affinity
    path_distance = np.sum(np.diff(mfcc_sync, axis=1) ** 2, axis=0)
    sigma = np.median(path_distance) + 1e-9
    path_sim = np.exp(-path_distance / sigma)
    R_path = np.diag(path_sim, k=1) + np.diag(path_sim, k=-1)
    deg_path = np.sum(R_path, axis=1)
    deg_rec = np.sum(Rf, axis=1)
    mu = deg_path.dot(deg_path + deg_rec) / (
        np.sum((deg_path + deg_rec) ** 2) + 1e-9
    )
    A = mu * Rf + (1 - mu) * R_path
    L = scipy.sparse.csgraph.laplacian(A, normed=True)
    _, evecs = scipy.linalg.eigh(L)
    evecs = scipy.ndimage.median_filter(evecs, size=(smooth_beats, 1))
    Cnorm = np.cumsum(evecs ** 2, axis=1) ** 0.5
    X = evecs[:, :k] / (Cnorm[:, k - 1: k] + 1e-9)
    km = sklearn.cluster.KMeans(n_clusters=k, n_init=10, random_state=0)
    return km.fit_predict(X)


def _labels_to_segments(labels: np.ndarray, beat_times: np.ndarray, duration: float) -> list[Segment]:
    segs: list[Segment] = []
    start_idx = 0
    for i in range(1, len(labels) + 1):
        if i == len(labels) or labels[i] != labels[start_idx]:
            start = float(beat_times[start_idx])
            end = float(beat_times[i]) if i < len(beat_times) else duration
            segs.append(Segment(start=start, end=end, cluster=int(labels[start_idx])))
            start_idx = i
    if segs:
        segs[0].start = 0.0
        segs[-1].end = duration
    return segs


def _merge_short(segs: list[Segment], min_dur: float) -> list[Segment]:
    """Merge segments shorter than min_dur into their most similar neighbor."""
    segs = list(segs)
    changed = True
    while changed and len(segs) > 1:
        changed = False
        for i, s in enumerate(segs):
            if s.duration >= min_dur:
                continue
            prev_seg = segs[i - 1] if i > 0 else None
            next_seg = segs[i + 1] if i < len(segs) - 1 else None
            target = None
            if prev_seg is not None and prev_seg.cluster == s.cluster:
                target = i - 1
            elif next_seg is not None and next_seg.cluster == s.cluster:
                target = i + 1
            elif prev_seg is None:
                target = i + 1
            elif next_seg is None:
                target = i - 1
            else:
                target = i - 1 if prev_seg.duration <= next_seg.duration else i + 1
            if target == i - 1:
                segs[target].end = s.end
            else:
                segs[target].start = s.start
            del segs[i]
            changed = True
            break
    return segs


def _segment_mean_feature(seg: Segment, feats: np.ndarray, beat_times: np.ndarray) -> np.ndarray:
    idx = np.where((beat_times >= seg.start) & (beat_times < seg.end))[0]
    if len(idx) == 0:
        idx = np.array([np.searchsorted(beat_times, seg.start) - 1]).clip(0)
    idx = idx[idx < feats.shape[1]]
    return feats[:, idx].mean(axis=1)


def _similarity_merge(segs, feats, beat_times, sim_thresh=0.93, max_frag=16.0):
    """Fuse adjacent segments that are near-identical in mean chroma+timbre."""
    segs = list(segs)
    changed = True
    while changed and len(segs) > 3:
        changed = False
        for i in range(len(segs) - 1):
            a, b = segs[i], segs[i + 1]
            if min(a.duration, b.duration) > max_frag:
                continue
            va = _segment_mean_feature(a, feats, beat_times)
            vb = _segment_mean_feature(b, feats, beat_times)
            sim = float(np.dot(va, vb) / (np.linalg.norm(va) * np.linalg.norm(vb) + 1e-9))
            if sim >= sim_thresh:
                keep = a if a.duration >= b.duration else b
                a.end = b.end
                a.cluster = keep.cluster
                del segs[i + 1]
                changed = True
                break
    return segs


def _refine_boundaries(segs, feats, beat_times, window=4.0, span=8.0) -> None:
    """Snap each internal boundary to the local feature-contrast maximum."""
    for i in range(len(segs) - 1):
        tb = segs[i].end
        cand_idx = np.where((beat_times >= tb - window) & (beat_times <= tb + window))[0]
        lo = segs[i].start + 2.0
        hi = segs[i + 1].end - 2.0
        best_t, best_c = tb, -1.0
        for j in cand_idx:
            t = float(beat_times[j])
            if not lo < t < hi:
                continue
            pre = (beat_times >= t - span) & (beat_times < t)
            post = (beat_times >= t) & (beat_times < t + span)
            if pre.sum() < 2 or post.sum() < 2:
                continue
            va = feats[:, pre[: feats.shape[1]]].mean(axis=1)
            vb = feats[:, post[: feats.shape[1]]].mean(axis=1)
            contrast = float(np.linalg.norm(va - vb))
            if contrast > best_c:
                best_c, best_t = contrast, t
        segs[i].end = best_t
        segs[i + 1].start = best_t


def _absorb_fragments(segs, feats, beat_times, min_dur) -> list[Segment]:
    segs = list(segs)
    changed = True
    while changed and len(segs) > 3:
        changed = False
        for i, s in enumerate(segs):
            if s.duration >= min_dur:
                continue
            vs = _segment_mean_feature(s, feats, beat_times)

            def sim_to(other):
                vo = _segment_mean_feature(other, feats, beat_times)
                return float(np.dot(vs, vo) / (np.linalg.norm(vs) * np.linalg.norm(vo) + 1e-9))

            left = sim_to(segs[i - 1]) if i > 0 else -np.inf
            right = sim_to(segs[i + 1]) if i < len(segs) - 1 else -np.inf
            if left >= right:
                segs[i - 1].end = s.end
            else:
                segs[i + 1].start = s.start
            del segs[i]
            changed = True
            break
    return segs


def _coalesce(segs: list[Segment]) -> list[Segment]:
    """Fuse adjacent segments that ended up in the same cluster."""
    out: list[Segment] = []
    for s in segs:
        if out and out[-1].cluster == s.cluster:
            out[-1].end = s.end
        else:
            out.append(s)
    return out


def _segment_energy(segs, rms, rms_times):
    for s in segs:
        mask = (rms_times >= s.start) & (rms_times < s.end)
        s.energy = float(np.mean(rms[mask])) if mask.any() else 0.0


def _assign_labels(segs: list[Segment]) -> None:
    """Heuristic section naming from position, energy, and cluster repetition."""
    if not segs:
        return
    n = len(segs)
    energies = np.array([s.energy for s in segs])
    emax = energies.max() + 1e-9
    rel = energies / emax

    clusters: dict[int, list[int]] = {}
    for i, s in enumerate(segs):
        clusters.setdefault(s.cluster, []).append(i)

    # chorus = the repeated cluster with the highest mean energy
    chorus_cluster = None
    best_score = -1.0
    for c, idxs in clusters.items():
        if len(idxs) < 2 and n > 3:
            continue
        score = float(np.mean(rel[idxs])) * (1 + 0.25 * (len(idxs) - 1))
        if score > best_score:
            best_score = score
            chorus_cluster = c

    for i, s in enumerate(segs):
        if s.cluster == chorus_cluster:
            s.label = "chorus"
        else:
            s.label = "verse"

    # intro: first segment if it's not the chorus energy-wise
    if segs[0].label != "chorus" or rel[0] < 0.75:
        segs[0].label = "intro"

    # outro: last segment, if quieter than the peak or a non-chorus cluster
    if n >= 3 and (rel[-1] < 0.8 or segs[-1].label != "chorus"):
        segs[-1].label = "outro"

    # bridge: a non-chorus, non-repeated cluster in the last two-thirds
    for i in range(1, n - 1):
        s = segs[i]
        if s.label != "verse":
            continue
        if len(clusters[s.cluster]) == 1 and i / n > 0.45:
            s.label = "bridge"
            break

    counts: dict[str, int] = {}
    for s in segs:
        counts[s.label] = counts.get(s.label, 0) + 1
        s.label_index = counts[s.label]


def _novelty_fallback(y, sr, duration, rms, rms_times) -> list[Segment]:
    """Energy/novelty-based boundary detection when clustering is unusable."""
    hop = 512
    S = np.abs(librosa.stft(y, hop_length=hop))
    contrast = librosa.feature.spectral_contrast(S=S, sr=sr)
    novelty = librosa.onset.onset_strength(S=librosa.power_to_db(S ** 2), sr=sr)
    feat = np.vstack([
        librosa.util.normalize(contrast, axis=1),
        librosa.util.normalize(novelty[None, :], axis=1),
    ])
    n_target = max(3, min(10, int(duration / 25)))
    bound_frames = librosa.segment.agglomerative(feat, n_target)
    bound_times = librosa.frames_to_time(bound_frames, sr=sr, hop_length=hop)
    times = [0.0] + [float(t) for t in bound_times if 1.0 < t < duration - 1.0] + [duration]
    segs = [Segment(start=a, end=b, cluster=i) for i, (a, b) in enumerate(zip(times[:-1], times[1:]))]
    segs = _merge_short(segs, MIN_SEGMENT_SEC)
    _segment_energy(segs, rms, rms_times)
    if segs:
        emax = max(s.energy for s in segs) + 1e-9
        for s in segs:
            s.cluster = int(round(3 * s.energy / emax))
    return segs


def analyze(path: str, n_clusters: int | None = None) -> dict:
    y, sr = librosa.load(path, sr=22050, mono=True)
    duration = float(len(y) / sr)
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    rms_times = librosa.times_like(rms, sr=sr, hop_length=512)

    method = "laplacian"
    tempo = 0.0
    beat_times = np.array([])
    try:
        tempo, _, beat_times, chroma_sync, mfcc_sync, rms_sync = _beat_sync_features(y, sr)
        if len(beat_times) < 32:
            raise ValueError("too few beats for structural clustering")

        best: list[Segment] | None = None
        best_score = -np.inf

        beats_per_sec = len(beat_times) / max(duration, 1)
        smooth = max(9, int(8 * beats_per_sec) | 1)
        feats = _structure_features(chroma_sync, mfcc_sync)

        rms_z = (rms_sync - rms_sync.mean()) / (rms_sync.std() + 1e-9)
        mfcc_z = (mfcc_sync - mfcc_sync.mean(axis=1, keepdims=True)) / (
            mfcc_sync.std(axis=1, keepdims=True) + 1e-9
        )
        rfeats = np.vstack([chroma_sync, 0.6 * mfcc_z, 2.0 * rms_z])

        k_range = [n_clusters] if n_clusters else range(3, 10)
        for k in k_range:
            labels = _laplacian_cluster(feats, mfcc_sync, k, smooth)
            segs = _labels_to_segments(labels, beat_times, duration)
            segs = _coalesce(_merge_short(segs, MIN_SEGMENT_SEC))
            segs = _coalesce(_similarity_merge(segs, feats, beat_times))
            segs = _coalesce(_similarity_merge(segs, feats, beat_times, sim_thresh=0.88, max_frag=12.0))
            _refine_boundaries(segs, rfeats, beat_times)
            segs = _coalesce(_absorb_fragments(segs, feats, beat_times, MIN_SEGMENT_SEC))
            if not 3 <= len(segs) <= 14:
                continue
            _segment_energy(segs, rms, rms_times)

            expected = duration / 26.0
            count_pen = abs(len(segs) - expected) / max(expected, 1)
            reps = len(segs) - len({s.cluster for s in segs})
            max_dur = max(s.duration for s in segs)
            long_pen = max(0.0, max_dur - min(70.0, duration / 3)) / 20.0
            score = reps * 0.5 - count_pen - long_pen
            if score > best_score:
                best_score = score
                best = segs

        if best is None:
            raise ValueError("clustering produced no plausible segmentation")
        segments = best
    except Exception as e:  # noqa: BLE001
        method = f"novelty-fallback ({type(e).__name__}: {e})"
        segments = _novelty_fallback(y, sr, duration, rms, rms_times)

    _assign_labels(segments)

    step = max(1, int(round((sr / 512) / ENERGY_CURVE_HZ)))
    energy_curve = [
        {"t": round(float(t), 2), "rms": round(float(v), 5)}
        for t, v in zip(rms_times[::step], rms[::step])
    ]

    return {
        "duration": round(duration, 3),
        "tempo": round(tempo, 1),
        "beat_times": [round(float(b), 3) for b in beat_times],
        "method": method,
        "energy_curve": energy_curve,
        "segments": [
            {
                "label": s.label,
                "label_index": s.label_index,
                "name": f"{s.label} {s.label_index}" if s.label in ("verse", "chorus") else s.label,
                "start": round(s.start, 3),
                "end": round(s.end, 3),
                "duration": round(s.duration, 3),
                "energy": round(s.energy, 5),
                "cluster": s.cluster,
            }
            for s in segments
        ],
    }


if __name__ == "__main__":
    result = analyze(sys.argv[1])
    if "--full" not in sys.argv:
        result = {
            **result,
            "beat_times": f"[{len(result['beat_times'])} beats]",
            "energy_curve": f"[{len(result['energy_curve'])} points]",
        }
    print(json.dumps(result, indent=2))
