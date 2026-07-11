// Prompt templates for concept generation, refinement, and lyrics transcription.
// All prompts enforce strict JSON output that we can parse deterministically.

import type { ConceptInput } from "../types/index.js";

export const CONCEPT_SYSTEM = `You are VERSE2, an elite music video creative director. You design cinematographic treatments, scene-by-scene shot lists, and budget-aware production plans.

Hard rules:
- Output ONE valid JSON object. No markdown. No commentary. No trailing commas.
- Always return exactly THREE distinct creative concepts (indices 0, 1, 2). Each must be visually distinct, not variations of each other.
- Each concept must have 4–10 scenes. Every scene must be tied to a real song segment (use the segment_label field exactly as provided).
- Every scene must have 3–8 shots. Each shot has a type, a 1-line description, a duration in seconds, and a camera_movement string.
- Every shot's duration must be ≤ that scene's song-segment duration in seconds.
- All timestamps in the scene must come from the song segments provided. Do not invent new timestamps.
- Respect the rate card. If a shot needs drone work, set scene.needs_drone = true. If a shot needs VFX, set scene.needs_fx = true.
- Be specific. "A wide shot of the city" is bad. "Wide shot, Lagos Third Mainland Bridge at 6am, traffic below, anamorphic flare from low sun" is good.
- The three concepts MUST be visually distinct: different visual_style, different location types, different pacing.`;

export function buildConceptPrompt(input: ConceptInput): string {
  const segs = input.segments
    .map(
      (s) =>
        `- ${s.name} (${s.start.toFixed(2)}s – ${s.end.toFixed(2)}s, ${s.duration.toFixed(1)}s, energy=${s.energy.toFixed(3)})`
    )
    .join("\n");
  return `Generate 3 distinct music video concepts for this track.

Track: ${input.track_title ?? "(untitled)"} by ${input.artist_name ?? "(unknown artist)"}
Genre: ${input.track_genre ?? "unspecified"}
Tempo: ${input.tempo} BPM  |  Total duration: ${input.total_duration.toFixed(1)}s
Target audience: ${input.target_audience ?? "general"}
Visual mood: ${input.visual_mood ?? "open — pick what fits the song"}
Reference artists: ${input.reference_artists ?? "none given"}
Must-haves: ${input.must_haves ?? "none given"}

Song structure (use these segment labels EXACTLY):
${segs}

Return JSON of the form:
{
  "concepts": [
    {
      "index": 0,
      "title": "...",
      "logline": "1–2 sentence hook",
      "visual_style": "lookbook-grade description (color palette, lens choice, lighting)",
      "pacing": "one-paragraph description of how the video breathes with the song",
      "scenes": [
        {
          "index": 0,
          "segment_label": "verse 1",
          "segment_start": 0.0,
          "segment_end": 25.4,
          "location": "Specific place — not 'a city' but 'Mushin market, Lagos, 11pm'",
          "description": "1–2 sentences on what happens visually in this scene",
          "cast_size": 2,
          "dancer_count": 0,
          "needs_drone": false,
          "needs_fx": false,
          "shots": [
            {
              "index": 0,
              "shot_type": "wide",
              "description": "1 sentence, very specific",
              "duration_sec": 4.5,
              "camera_movement": "static | slow dolly | handheld | drone push-in | etc."
            }
          ]
        }
      ]
    }
  ]
}`;
}

export const REVISION_SYSTEM = `You are VERSE2 revising an existing music video treatment to fit a smaller budget while preserving the artistic intent. You will receive the original concept plus a list of cost-reduction strategies that were already applied. Produce a single revised concept JSON with the same shape.

Hard rules:
- Same JSON shape as the original concept (scenes, shots, etc.)
- Preserve the visual style. The user fell in love with the look — don't gut it.
- If a strategy says "merge two locations into one", do that. If it says "drop dancers", remove dancers from scenes that had them.
- The total cost after your revision must be lower than the total cost given to you.`;
