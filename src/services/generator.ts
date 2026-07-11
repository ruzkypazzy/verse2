// Thin OpenAI-compatible wrapper. Falls back to a deterministic mock if no API key
// is configured, so the service still runs end-to-end on a fresh clone.

import OpenAI from "openai";
import { env, hasLLM } from "../config/env.js";
import {
  buildConceptPrompt,
  CONCEPT_SYSTEM,
  REVISION_SYSTEM,
} from "../prompts/conceptGeneration.js";
import type { Concept, ConceptInput, Scene, Shot, AudioAnalysis } from "../types/index.js";

const client = hasLLM
  ? new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl })
  : null;

async function callLLM(
  system: string,
  user: string,
  jsonMode: boolean
): Promise<string> {
  if (!client) {
    throw new Error("LLM not configured (set OPENAI_API_KEY to enable real generation)");
  }
  const res = await client.chat.completions.create({
    model: env.openaiModel,
    temperature: jsonMode ? 0.7 : 0.5,
    response_format: jsonMode ? { type: "json_object" } : undefined,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const out = res.choices[0]?.message?.content ?? "";
  if (!out) throw new Error("LLM returned empty content");
  return out;
}

function extractJsonObject(text: string): unknown {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch { /* fall through */ }
  // Try to locate the first balanced JSON object
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = text.slice(first, last + 1);
    try { return JSON.parse(slice); } catch { /* fall through */ }
  }
  throw new Error("LLM did not return valid JSON");
}

export async function generateConcepts(
  analysis: AudioAnalysis,
  input: ConceptInput
): Promise<Concept[]> {
  if (!client) return mockConcepts(analysis, input);
  const text = await callLLM(CONCEPT_SYSTEM, buildConceptPrompt(input), true);
  const parsed = extractJsonObject(text) as { concepts?: Concept[] };
  if (!parsed.concepts || !Array.isArray(parsed.concepts)) {
    throw new Error("LLM JSON missing 'concepts' array");
  }
  // Validate + repair: clamp shot durations, ensure indices exist
  return parsed.concepts.map((c, i) => normalizeConcept(c, i, analysis));
}

export async function refineScenes(
  concept: Concept,
  analysis: AudioAnalysis,
  appliedStrategies: string[]
): Promise<Concept> {
  if (!client) {
    // Mock refinement: just halve cast_size and dancer_count
    return {
      ...concept,
      scenes: concept.scenes.map((s) => ({
        ...s,
        cast_size: Math.max(1, Math.floor(s.cast_size / 2)),
        dancer_count: Math.max(0, Math.floor(s.dancer_count / 2)),
      })),
    };
  }
  const user = JSON.stringify(
    {
      original_concept: concept,
      applied_strategies: appliedStrategies,
      instruction:
        "Apply the strategies above. Return a single revised concept with the same shape.",
    },
    null,
    2
  );
  const text = await callLLM(REVISION_SYSTEM, user, true);
  const parsed = extractJsonObject(text) as Concept;
  return normalizeConcept(parsed, concept.index, analysis);
}

function normalizeConcept(c: Concept, idx: number, analysis: AudioAnalysis): Concept {
  const segByLabel = new Map(analysis.segments.map((s) => [s.name, s] as const));
  const scenes: Scene[] = (c.scenes ?? []).map((s, i) => {
    const seg = segByLabel.get(s.segment_label);
    const start = seg?.start ?? s.segment_start ?? 0;
    const end = seg?.end ?? s.segment_end ?? start;
    const duration = end - start;
    const shots: Shot[] = (s.shots ?? []).map((sh, j) => ({
      index: j,
      scene_index: i,
      shot_type: sh.shot_type ?? "wide",
      description: sh.description ?? "",
      duration_sec: Math.max(0.5, Math.min(Number(sh.duration_sec) || 2.0, duration)),
      camera_movement: sh.camera_movement ?? "static",
    }));
    return {
      index: i,
      segment_label: s.segment_label,
      segment_start: start,
      segment_end: end,
      location: s.location ?? "unspecified",
      description: s.description ?? "",
      cast_size: Math.max(1, Number(s.cast_size) || 1),
      dancer_count: Math.max(0, Number(s.dancer_count) || 0),
      needs_drone: Boolean(s.needs_drone),
      needs_fx: Boolean(s.needs_fx),
      shots,
    };
  });
  return {
    index: idx,
    title: c.title ?? `Concept ${idx + 1}`,
    logline: c.logline ?? "",
    visual_style: c.visual_style ?? "",
    pacing: c.pacing ?? "",
    scenes,
  };
}

// Deterministic mock: 3 concepts, each with 1 scene per song segment,
// no LLM cost. Used when OPENAI_API_KEY is empty.
function mockConcepts(analysis: AudioAnalysis, input: ConceptInput): Concept[] {
  const genre = (input.track_genre ?? "pop").toLowerCase();
  const palettes = [
    { name: "Neon Noir", style: "High-contrast night exteriors, sodium-vapor lamps, anamorphic flares", pace: "Slow dolly moves, long takes, restraint" },
    { name: "Sun-bleached Wanderlust", style: "Golden-hour exteriors, Kodak 250D grain, natural light, lens flares", pace: "Handheld warmth, breath-led pacing" },
    { name: "Brutalist Performance", style: "Concrete interiors, single-source lighting, monochrome with one accent color", pace: "Sharp cuts on downbeats, contained choreography" },
  ];
  return palettes.map((p, idx) => ({
    index: idx,
    title: p.name,
    logline: `A ${genre} treatment leaning into ${p.name.toLowerCase()} visual language.`,
    visual_style: p.style,
    pacing: p.pace,
    scenes: analysis.segments.map((seg, i) => ({
      index: i,
      segment_label: seg.name,
      segment_start: seg.start,
      segment_end: seg.end,
      location: `Location ${i + 1} for ${seg.label}`,
      description: `Mock-generated visual for ${seg.name} (energy=${seg.energy.toFixed(2)}).`,
      cast_size: seg.label === "chorus" ? 4 : 2,
      dancer_count: seg.label === "chorus" ? 6 : 0,
      needs_drone: seg.label === "intro" || seg.label === "outro",
      needs_fx: seg.label === "bridge",
      shots: [
        { index: 0, scene_index: i, shot_type: "wide", description: "Establishing wide shot", duration_sec: Math.min(3.0, (seg.end - seg.start) / 3), camera_movement: "slow dolly" },
        { index: 1, scene_index: i, shot_type: "medium", description: "Performance medium", duration_sec: Math.min(3.0, (seg.end - seg.start) / 3), camera_movement: "handheld" },
        { index: 2, scene_index: i, shot_type: "close", description: "Emotional close-up", duration_sec: Math.min(3.0, (seg.end - seg.start) / 3), camera_movement: "static" },
      ],
    })),
  }));
}
