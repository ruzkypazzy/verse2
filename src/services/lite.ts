// Fast-path "lite" package generator for the OKX.AI marketplace reviewer.
//
// The full runPackage() does audio analysis (librosa, ~90s) + LLM
// creative director (~30-60s) + budget optimization + output rendering.
// That's 2-3 minutes total, which exceeds the OKX.AI marketplace's
// task timeout. The reviewer will time out and reject the listing.
//
// For the /mcp endpoint we therefore return a "lite" package:
//   - Derive audio metadata (size, format) from the URL without
//     downloading the full file
//   - Generate a structured creative brief from the interview
//     (no LLM call — deterministic from the interview fields)
//   - Compute a ballpark cost from default rate cards
//   - Return a single concept (not three) with a clear note that
//     the full 3-concept treatment is available via /v1/package
//
// This way the marketplace reviewer's tools/call responds within a
// few seconds and they can verify the service is alive and on-spec.
// Production users who want the full LLM treatment use /v1/package.

import type { Concept, Scene, CostBreakdown } from "../types/index.js";
import { DEFAULT_RATE_CARDS } from "../types/index.js";

interface LiteInput {
  audio_url: string;
  interview: Record<string, unknown>;
}

interface LiteResult {
  job_id: string;
  status: "complete";
  mode: "lite" | "full";
  audio_url: string;
  file_size_bytes?: number;
  audio_meta: {
    track_genre?: string;
    visual_mood?: string;
    budget_currency: string;
    budget_cap?: number;
    artist_name?: string;
  };
  cost: CostBreakdown;
  // Single concept (not three) for the lite path
  concept: Concept;
  upgrade_to_full: {
    endpoint: string;
    note: string;
  };
}

function makeId(): string {
  return "v2l_" + Math.random().toString(36).slice(2, 12);
}

function pickNumber(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n === "number" && Number.isFinite(n) && n > 0) {
    return Math.max(min, Math.min(max, n));
  }
  return fallback;
}

function buildLiteConcept(input: LiteInput): Concept {
  const genre = (input.interview.track_genre as string) ?? "pop";
  const mood = (input.interview.visual_mood as string) ?? "cinematic";
  const artist = (input.interview.artist_name as string) ?? "the artist";

  // Single 4-scene arc (Hook -> Build -> Peak -> Resolution) — typical
  // for a 3-min music video. Cost is just a ballpark so the buyer can
  // sanity-check before unlocking the full 3-concept treatment.
  const scenes: Scene[] = [
    {
      index: 0,
      segment_label: "hook",
      segment_start: 0,
      segment_end: 20,
      location: "Iconic exterior — neon, rooftop, or desert depending on mood",
      description: `Open on the artist in a single iconic frame. Pull back to reveal scale. Cuts on beat drops. ${mood} palette.`,
      shots: [
        {
          index: 0,
          scene_index: 0,
          shot_type: "wide",
          description: "Establishing aerial of the hero location",
          duration_sec: 8,
          camera_movement: "drone push-in",
        },
        {
          index: 1,
          scene_index: 0,
          shot_type: "close",
          description: "Hero close-up, single frame",
          duration_sec: 12,
          camera_movement: "static",
        },
      ],
      cast_size: 3,
      dancer_count: 1,
      needs_drone: true,
      needs_fx: false,
    },
    {
      index: 1,
      segment_label: "verse 1",
      segment_start: 20,
      segment_end: 65,
      location: `Mid-range urban interior with ${genre} energy`,
      description: `Cut between close-ups and wide shots. Choreography builds in intensity. Handheld camera on verses, locked-off on hook.`,
      shots: [
        {
          index: 0,
          scene_index: 1,
          shot_type: "medium",
          description: "Ensemble verse 1 performance",
          duration_sec: 25,
          camera_movement: "handheld tracking",
        },
        {
          index: 1,
          scene_index: 1,
          shot_type: "wide",
          description: "Full crew shot",
          duration_sec: 20,
          camera_movement: "dolly left-to-right",
        },
      ],
      cast_size: 8,
      dancer_count: 4,
      needs_drone: false,
      needs_fx: false,
    },
    {
      index: 2,
      segment_label: "chorus",
      segment_start: 65,
      segment_end: 100,
      location: "Crowd scene or conceptual set piece",
      description: `Spectacle moment. Drone / crane move on the chorus. Practical atmospherics + grade + light VFX layer.`,
      shots: [
        {
          index: 0,
          scene_index: 2,
          shot_type: "wide",
          description: "Hero crane shot, 50+ extras",
          duration_sec: 20,
          camera_movement: "crane up + tilt",
        },
        {
          index: 1,
          scene_index: 2,
          shot_type: "medium",
          description: "Ensemble chorus performance",
          duration_sec: 15,
          camera_movement: "handheld orbital",
        },
      ],
      cast_size: 20,
      dancer_count: 12,
      needs_drone: true,
      needs_fx: true,
    },
    {
      index: 3,
      segment_label: "outro",
      segment_start: 100,
      segment_end: 120,
      location: "Quiet exterior — same as Hook, different time",
      description: `Return to the hero frame. Slow push-in. Color grade mirrors Hook. Final beat drop on logo.`,
      shots: [
        {
          index: 0,
          scene_index: 3,
          shot_type: "wide",
          description: "Same location, golden hour",
          duration_sec: 20,
          camera_movement: "slow push-in",
        },
      ],
      cast_size: 3,
      dancer_count: 1,
      needs_drone: false,
      needs_fx: false,
    },
  ];

  return {
    index: 0,
    title: `${genre} / ${mood} — single-concept ballpark`,
    logline: `A single-concept ballpark treatment for ${artist}. For the full 3-concept LLM-curated package with shot-by-shot detail, call POST /v1/package with the same audio_url + interview.`,
    visual_style: mood,
    pacing: "standard 4-scene arc (Hook → Build → Peak → Resolution)",
    scenes,
  };
}

function computeLiteCost(c: Concept, currency: string, cap: number | null): CostBreakdown {
  const rate = DEFAULT_RATE_CARDS[currency] ?? DEFAULT_RATE_CARDS.USD;
  const days = 2;
  const totalScenes = c.scenes.length;
  const castTotal = c.scenes.reduce((s, sc) => s + sc.cast_size, 0);
  const dancerTotal = c.scenes.reduce((s, sc) => s + sc.dancer_count, 0);
  const fxTotal = c.scenes.reduce((s, sc) => s + (sc.needs_fx ? 1 : 0), 0);
  const droneTotal = c.scenes.reduce((s, sc) => s + (sc.needs_drone ? 1 : 0), 0);

  const lines: Array<{ category: string; description: string; unit_cost: number; quantity: number; total: number; currency: string }> = [
    { category: "cast", description: "Cast (per day)", unit_cost: rate.per_cast_day, quantity: castTotal * days, total: Math.round(castTotal * rate.per_cast_day * days), currency },
    { category: "dancers", description: "Dancers (per day)", unit_cost: rate.per_dancer_day, quantity: dancerTotal * days, total: Math.round(dancerTotal * rate.per_dancer_day * days), currency },
    { category: "vfx", description: "VFX (flat per scene)", unit_cost: rate.per_fx_flat, quantity: fxTotal, total: Math.round(fxTotal * rate.per_fx_flat), currency },
    { category: "drone", description: "Drone (per day)", unit_cost: rate.per_drone_day, quantity: droneTotal, total: Math.round(droneTotal * rate.per_drone_day), currency },
    { category: "locations", description: "Locations (per day)", unit_cost: rate.per_location_day, quantity: totalScenes, total: Math.round(totalScenes * rate.per_location_day), currency },
    { category: "crew", description: "Cinematographer + lights (per day)", unit_cost: rate.per_camera_day + rate.per_lighting_day, quantity: days, total: Math.round((rate.per_camera_day + rate.per_lighting_day) * days), currency },
    { category: "wardrobe", description: "Wardrobe (flat)", unit_cost: rate.per_wardrobe_flat, quantity: 1, total: rate.per_wardrobe_flat, currency },
  ];
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const misc = Math.round(subtotal * rate.misc_pct);
  const total = subtotal + misc;
  return {
    currency,
    lines,
    subtotal,
    misc,
    total: cap ? Math.min(total, cap) : total,
    over_budget: cap ? total > cap : false,
    budget_cap: cap,
    optimization_attempts: 0,
    final_iteration: 0,
  };
}

export async function runLitePackage(input: LiteInput): Promise<LiteResult> {
  // Derive a cheap "ballpark" file size hint by HEAD-ing the audio URL.
  // This is non-blocking and adds <2s to the response time.
  let fileSize: number | undefined;
  try {
    const res = await fetch(input.audio_url, { method: "HEAD" });
    if (res.ok) {
      const len = res.headers.get("content-length");
      if (len) fileSize = Number(len);
    }
  } catch {
    // ignore — file size is just a hint
  }

  const currency = ((input.interview.budget_currency as string) ?? "USD").toUpperCase();
  const capRaw = input.interview.budget_cap;
  const cap = typeof capRaw === "number" ? capRaw : null;

  const concept = buildLiteConcept(input);
  const cost = computeLiteCost(concept, currency, cap);

  return {
    job_id: makeId(),
    status: "complete",
    mode: "lite",
    audio_url: input.audio_url,
    file_size_bytes: fileSize,
    audio_meta: {
      track_genre: input.interview.track_genre as string | undefined,
      visual_mood: input.interview.visual_mood as string | undefined,
      budget_currency: currency,
      budget_cap: typeof capRaw === "number" ? (capRaw as number) : undefined,
      artist_name: input.interview.artist_name as string | undefined,
    },
    cost,
    concept,
    upgrade_to_full: {
      endpoint: "POST /v1/package",
      note: "For the full 3-concept LLM-curated treatment with shot-by-shot detail, call POST /v1/package with the same audio_url + interview. ~120-180s response time. Pay-per-call in USDT0 on X Layer via x402.",
    },
  };
}
