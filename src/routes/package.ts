// /v1 endpoints. The main entry is /v1/package which is gated by x402.

import { Router, type Request, type Response } from "express";
import { x402PackageGate, x402RevisionGate } from "../x402/wrapper.js";
import { runPackage, runRevision } from "../services/orchestrator.js";
import { getJob } from "../db/jobs.js";
import { join, basename } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { env } from "../config/env.js";

export const packageRouter = Router();

const FILES_WHITELIST = new Set([
  "treatment.html",
  "treatment.pdf",
  "shot_list.csv",
  "shooting_schedule.csv",
]);

packageRouter.post("/v1/package", x402PackageGate(), async (req: Request, res: Response) => {
  // Body is optional. Marketplace QA probes may POST with empty body
  // to verify the paid path. Default to a public demo audio.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const audio_url = (typeof body.audio_url === "string" && body.audio_url.length > 0)
    ? body.audio_url
    : "https://verse2.org/demo-track.wav";
  // Respond IMMEDIATELY with status=processing. The marketplace UI has a
  // very short client-side timeout (1-2s). The package build runs in
  // the background; result is polled via the jobId.
  const jobId = `JOB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const startedAt = new Date().toISOString();
  console.log(`[verse2] responding 200 processing immediately, jobId=${jobId}`);
  setImmediate(() => {
    runPackage({
      audio_url,
      interview: (body.interview as Record<string, unknown>) ?? {},
      selected_concept_index: typeof body.selected_concept_index === "number" ? body.selected_concept_index : undefined,
      budget_cap: typeof body.budget_cap === "number" ? body.budget_cap : undefined,
      optimize: body.optimize !== false,
    }, jobId)  // pass the synthetic jobId so the DB + files use the same ID
      .then((r) => console.log(`[verse2] background package done: jobId=${jobId}`))
      .catch((e) => console.error(`[verse2] background package failed: ${e instanceof Error ? e.message : e}`));
  });
  res.json({
    status: "processing",
    message: "Package build queued. Poll GET /v1/jobs/:id for status. When complete, GET /v1/jobs/:id/files/treatment.{html,pdf} and /shot_list.csv contain the deliverables. The package typically completes in 30-60 seconds.",
    jobId,
    audio_url,
    startedAt,
    statusUrl: `${env.publicBaseUrl}/v1/jobs/${jobId}`,
    files: {
      treatment_html: `${env.publicBaseUrl}/v1/jobs/${jobId}/files/treatment.html`,
      treatment_pdf: `${env.publicBaseUrl}/v1/jobs/${jobId}/files/treatment.pdf`,
      shot_list: `${env.publicBaseUrl}/v1/jobs/${jobId}/files/shot_list.csv`,
      shooting_schedule: `${env.publicBaseUrl}/v1/jobs/${jobId}/files/shooting_schedule.csv`,
    },
  });
  return;
});

packageRouter.get("/v1/package", x402PackageGate(), async (_req: Request, res: Response) => {
  // GET /v1/package is not supported. The x402PackageGate middleware
  // will already have returned a 402 challenge for unpaid requests.
  // For paid requests, this returns 405 to indicate the method is wrong.
  res.status(405).json({ error: "Method Not Allowed", message: "Use POST /v1/package with a JSON body" });
});

packageRouter.get("/v1/jobs/:id", async (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  if (job.status === "complete" && job.result_json) {
    res.json({
      job_id: job.job_id,
      status: job.status,
      progress: job.progress,
      result: JSON.parse(job.result_json),
    });
    return;
  }
  res.json({
    job_id: job.job_id,
    status: job.status,
    progress: job.progress,
    error: job.error,
  });
});

packageRouter.post(
  "/v1/jobs/:id/revise",
  x402RevisionGate(),
  async (req: Request, res: Response) => {
    const freeText = (req.body as { revision?: string })?.revision;
    if (typeof freeText !== "string" || freeText.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "revision string required" });
      return;
    }
    try {
      const result = await runRevision(req.params.id, freeText);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(422).json({ error: "Revision failed", message });
    }
  }
);

// File delivery. The filename is whitelisted to prevent path traversal.
packageRouter.get("/v1/jobs/:id/files/:filename", async (req: Request, res: Response) => {
  const filename = basename(req.params.filename);
  if (!FILES_WHITELIST.has(filename)) {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  const path = join(env.outputDir, `${req.params.id}-${filename}`);
  try {
    const s = await stat(path);
    if (!s.isFile()) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
  } catch {
    res.status(404).json({ error: "Not Found" });
    return;
  }
  const contentType =
    filename.endsWith(".html") ? "text/html; charset=utf-8"
    : filename.endsWith(".pdf") ? "application/pdf"
    : filename.endsWith(".csv") ? "text/csv; charset=utf-8"
    : "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(await readFile(path));
});
