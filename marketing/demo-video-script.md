# VERSE2 — 90-second demo video script

**Format:** 1080×1920 vertical (TikTok/Reels) OR 1920×1080 horizontal (X/Twitter preferred). **Do horizontal for the X post** — it autoplays bigger in the feed.

**Total runtime target:** 85 seconds (leave 5s buffer for the 90s OKX.AI cap)

**Audio:** Use the synthetic afrobeats track. Stripped, the audio plays for ~25s of the video; rest is narration over silent motion.

---

## Shot list (in order)

| # | Time | Visual | Voiceover / on-screen text |
|---|---|---|---|
| 1 | 0:00–0:03 | Black → logo "VERSE2" → "an OKX.AI agent" | "Drop a song. Get a full music video treatment." |
| 2 | 0:03–0:07 | Screen-recording: paste a song URL into the web UI's "Audio URL" field | "I uploaded an afrobeats track." |
| 3 | 0:07–0:12 | Click "Continue" → fill 2-3 fields (genre, currency, budget cap) | "Answer 7 questions. Took me 30 seconds." |
| 4 | 0:12–0:30 | Loading screen → smooth transition to results | "47 seconds later…" (real time elapsed — we use the actual clock) |
| 5 | 0:30–0:40 | Side-by-side: **input** waveform on top, **output** color-coded segments on bottom (intro/verse/chorus/bridge/outro) | "It broke the song into 7 sections — verse 1, chorus 1, verse 2, chorus 2, bridge, outro." |
| 6 | 0:40–0:55 | 3 concept cards from the web UI, click one to expand, scroll through the scene table | "Three visual concepts. I picked this one — Lagos at dawn, anamorphic." |
| 7 | 0:55–1:05 | Budget table: 3 locations, drone, FX, wardrobe, total. The "over budget" → "within budget" transition if applicable | "NGN 4,015,000. Under my 5M cap. Auto-optimized." |
| 8 | 1:05–1:15 | Click "Treatment PDF" download. Page 1 of the PDF: title, logline, visual style, pacing. | "Treatment. Shot list. Schedule. All in PDF." |
| 9 | 1:15–1:25 | Web UI close + GitHub repo + #OKXAI | "Open source. Pay per call. On OKX.AI." |
| 10 | 1:25–1:30 | End card: "Try it: [link] · #OKXAI @XLayerOfficial @okx" | (no VO, text only) |

**Total: 1:30** — exactly at the limit. Trim shot 4 to 15s if you need to be safe.

---

## Production notes

- **Music for the video:** Use the *output* of verse2's audio analysis — render the energy curve of the afrobeats track as a moving visual. We get this from the JSON `energy_curve` field. The motion of the segments becomes the soundtrack visualization.
- **Screen recording:** Use OBS or Loom. Record at 1920×1080, 30fps. Cursor visible.
- **Voiceover:** Yours, dry-recorded on your phone. Or AI voice from a clone. The demo lands harder with a real human voice.
- **Captions:** Add burned-in captions for X (lots of people watch on mute).
- **Color grade:** Match the web UI's dark `#0A0A0A` + green accent `#00D4AA`. Keeps it on-brand.

---

## Tools to use

- **Screen recording:** OBS Studio (free)
- **Editing:** DaVinci Resolve (free) or CapCut
- **Voiceover:** Record on phone, or use a clone (ElevenLabs, MiniMax M3)
- **Captions:** CapCut's auto-caption, or hand-typed for accuracy
- **Hosting the final mp4:** Upload directly to the X post (preferred — autoplay in feed) OR to a CDN and link

---

## After the video is done

1. Upload it directly to the X post (the in-line player is the best signal boost)
2. Add a 2nd post 24h later: "Here's what the JSON response looks like" — paste a redacted `PackageResult` and explain each section
3. Pin the main post to your profile

---

## B-roll alternatives (if you don't want to screen-record)

- Just the **rendered treatment.pdf** pages flipping (we generate this from `/v1/package` as the "files.treatment_pdf" URL)
- The **audio waveform with colored segments** (librosa + matplotlib → PNG, 5 lines of code)
- The **budget table** as a static card
- A 3-up of the **3 concept cards**

Pure-static is faster to produce but lower engagement. Screen-recording is the gold standard.
