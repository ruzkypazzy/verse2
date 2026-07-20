// Main pipeline. Walks:
//   1. Validate
//   2. Audio analysis (sidecar)
//   3. Optional: lyrics transcription (skipped if no OpenAI key — defer to v2)
//   4. Concept generation (LLM, or mock)
//   5. Initial cost calc
//   6. Optimize each concept against the budget cap
//   7. Pick the user's selected concept (or the first one)
//   8. Render outputs (PDF, HTML, CSV)
//   9. Persist job + return result

import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { downloadAudio, analyzeAudio } from "./audioAnalyzer.js";
import { generateConcepts } from "./generator.js";
import { computeCost, computeSchedule } from "./budget.js";
import { optimizeBudget } from "./optimizer.js";
import { renderOutputs } from "./outputs.js";
import {
  createJob,
  setJobResult,
  setJobError,
  updateJobStatus,
} from "../db/jobs.js";
import {
  DEFAULT_RATE_CARDS,
  type AudioAnalysis,
  type Concept,
  type ConceptInput,
  type CostBreakdown,
  type DayCost,
  type PackageRequest,
  type PackageResult,
} from "../types/index.js";

export async function runPackage(req: PackageRequest, providedJobId?: string): Promise<PackageResult> {
  const jobId = providedJobId ?? `JOB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  createJob(jobId);

  try {
    updateJobStatus(jobId, "running", 5);

    if (!req.audio_url) throw new Error("audio_url is required");
    if (!req.interview) throw new Error("interview is required");

    // Step 1: download + analyze audio
    const dl = await downloadAudio(req.audio_url);
    let analysis: AudioAnalysis;
    try {
      analysis = await analyzeAudio(dl.path);
    } finally {
      await dl.cleanup();
    }
    updateJobStatus(jobId, "running", 35);

    // Step 2: build concept input
    const conceptInput: ConceptInput = {
      track_genre: req.interview.track_genre,
      artist_name: req.interview.artist_name,
      track_title: req.interview.track_title,
      visual_mood: req.interview.visual_mood,
      reference_artists: req.interview.reference_artists,
      target_audience: req.interview.target_audience,
      must_haves: req.interview.must_haves,
      segments: analysis.segments,
      tempo: analysis.tempo,
      total_duration: analysis.duration,
    };

    // Step 3: generate 3 concepts
    const concepts = await generateConcepts(analysis, conceptInput);
    updateJobStatus(jobId, "running", 60);

    // Step 4: pick rate card
    const currency = (req.interview.budget_currency ?? "USD").toUpperCase();
    const rate = DEFAULT_RATE_CARDS[currency] ?? DEFAULT_RATE_CARDS.USD;
    const budgetCap = req.budget_cap ?? req.interview.budget_cap ?? null;

    // Step 5: optimize the user's selected concept against the budget
    const selectedIdx = Math.max(
      0,
      Math.min(req.selected_concept_index ?? 0, concepts.length - 1)
    );

    // Compute initial cost for all three (for the X-post dashboard)
    concepts.forEach((c) => computeCost(c, rate, null));

    const optimized = await optimizeBudget(concepts[selectedIdx], rate, budgetCap);
    const finalConcept: Concept = optimized.concept;
    const finalCost: CostBreakdown = optimized.cost;
    concepts[selectedIdx] = finalConcept;
    updateJobStatus(jobId, "running", 80);

    // Step 6: schedule
    const schedule: DayCost[] = computeSchedule(finalConcept, rate);

    // Step 7: render outputs
    const paths = await renderOutputs(jobId, {
      audio_url: req.audio_url,
      analysis,
      concepts,
      selected_concept_index: selectedIdx,
      cost: finalCost,
      schedule,
    });
    updateJobStatus(jobId, "running", 95);

    const result: PackageResult = {
      job_id: jobId,
      audio_url: req.audio_url,
      analysis,
      concepts,
      selected_concept_index: selectedIdx,
      cost: finalCost,
      schedule,
      files: paths,
      created_at: new Date().toISOString(),
    };

    setJobResult(jobId, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? `${err.message}` : String(err);
    setJobError(jobId, message);
    throw err;
  }
}

export async function runRevision(
  jobId: string,
  freeText: string
): Promise<PackageResult> {
  const job = (await import("../db/jobs.js")).getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  if (job.status !== "complete" || !job.result_json) {
    throw new Error(`Job ${jobId} is not complete; cannot revise`);
  }
  const prev = JSON.parse(job.result_json) as PackageResult;

  // Apply the free-text revision by adjusting the selected concept
  // in a simple, deterministic way: regenerate that one concept
  // with the free-text appended to the visual_mood field.
  const concept = prev.concepts[prev.selected_concept_index];
  const newAnalysis = prev.analysis;
  const newConceptInput: ConceptInput = {
    track_genre: undefined,
    visual_mood: freeText,
    segments: newAnalysis.segments,
    tempo: newAnalysis.tempo,
    total_duration: newAnalysis.duration,
  };
  const fresh = await generateConcepts(newAnalysis, newConceptInput);
  // Replace only the selected concept, keep the others
  const merged: Concept[] = prev.concepts.map((c, i) =>
    i === prev.selected_concept_index ? fresh[0] ?? c : c
  );
  const currency = (prev.cost.currency ?? "USD").toUpperCase();
  const rate = DEFAULT_RATE_CARDS[currency] ?? DEFAULT_RATE_CARDS.USD;
  const optimized = await optimizeBudget(merged[prev.selected_concept_index], rate, prev.cost.budget_cap);
  merged[prev.selected_concept_index] = optimized.concept;
  const cost: CostBreakdown = optimized.cost;
  const schedule = computeSchedule(merged[prev.selected_concept_index], rate);
  const paths = await renderOutputs(jobId, {
    audio_url: prev.audio_url,
    analysis: newAnalysis,
    concepts: merged,
    selected_concept_index: prev.selected_concept_index,
    cost,
    schedule,
  });
  const result: PackageResult = {
    ...prev,
    concepts: merged,
    cost,
    schedule,
    files: paths,
    created_at: new Date().toISOString(),
  };
  setJobResult(jobId, result);
  return result;
}
