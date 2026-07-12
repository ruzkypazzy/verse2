// /health, / (welcome + ASP manifest), /asp.json (for OKX.AI listing).

import { Router, type Request, type Response } from "express";
import { env, hasLLM } from "../config/env.js";
import { sidecarHealth } from "../services/audioAnalyzer.js";
import { existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { writeFile, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const healthRouter = Router();

interface CheckResult {
  ok: boolean;
  detail?: string;
}

async function check(name: string, fn: () => Promise<boolean> | boolean, detail?: string): Promise<CheckResult> {
  try {
    const ok = await fn();
    return { ok, detail };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

healthRouter.get("/health", async (_req: Request, res: Response) => {
  const checks = {
    sidecar: await check("sidecar", () => sidecarHealth(), env.sidecarUrl),
    openai: await check("openai", () => hasLLM, hasLLM ? `model=${env.openaiModel}` : "OPENAI_API_KEY not set (running in mock mode)"),
    receiving_wallet: await check("wallet", () => env.receivingWallet.length > 0, env.receivingWallet || "RECEIVING_WALLET_ADDRESS not set"),
    output_dir: await check("output", () => {
      mkdirSync(env.outputDir, { recursive: true });
      return existsSync(env.outputDir) && statSync(env.outputDir).isDirectory();
    }, env.outputDir),
    db: await check("db", () => {
      try {
        const path = env.dbPath;
        const dir = join(path, "..");
        mkdirSync(dir, { recursive: true });
        // Touch the file so the next connect() works
        if (!existsSync(path)) {
          writeFileSync(path, "", "utf8");
        }
        return existsSync(path);
      } catch (err) {
        return false;
      }
    }, env.dbPath),
  };
  const allOk = Object.values(checks).every((c) => c.ok);
  // 200 if the server is up and the filesystem is writable, even if
  // the sidecar/LLM/wallet are missing. 503 only if a hard dep is broken.
  const critical = checks.output_dir.ok && checks.db.ok;
  res.status(critical ? 200 : 503).json({
    ok: critical,
    service: "verse2",
    version: "0.1.0",
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint: shows which env vars Railway actually injected.
healthRouter.get("/debug-env", (_req: Request, res: Response) => {
  const keys = Object.keys(process.env).sort();
  res.json({
    total_count: keys.length,
    has_openai: 'OPENAI_API_KEY' in process.env,
    openai_len: (process.env.OPENAI_API_KEY ?? '').length,
    has_receiving_wallet: 'RECEIVING_WALLET_ADDRESS' in process.env,
    receiving_wallet_len: (process.env.RECEIVING_WALLET_ADDRESS ?? '').length,
    has_x402: 'X402_ASSET' in process.env,
    interesting_keys: keys.filter((k) =>
      ['OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_MODEL','RECEIVING_WALLET_ADDRESS',
       'X402_ASSET','X402_NETWORK','PUBLIC_BASE_URL','PORT','HOST'].includes(k)),
    all_relevant_present: {
      OPENAI_API_KEY: 'OPENAI_API_KEY' in process.env,
      RECEIVING_WALLET_ADDRESS: 'RECEIVING_WALLET_ADDRESS' in process.env,
      X402_ASSET: 'X402_ASSET' in process.env,
    },
  });
});

// Public demo track (royalty-free synthetic afrobeats) for the demo video
// and live testing. 30 seconds, 22050 Hz mono.
import { createReadStream } from "node:fs";
healthRouter.get("/demo-track.wav", (_req: Request, res: Response) => {
  try {
    // Path resolution: the dist/routes/health.js file ends up at /app/dist/routes/.
    // The demo track is at /app/demo-track.wav (per Dockerfile COPY).
    const candidates = [
      resolve(__dirname, "../../demo-track.wav"),  // /app/demo-track.wav from /app/dist/routes
      resolve(__dirname, "../demo-track.wav"),      // /app/dist/demo-track.wav
      resolve(__dirname, "../../../demo-track.wav"), // one level up
      resolve("/app/demo-track.wav"),
      resolve(process.cwd(), "demo-track.wav"),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) {
      res.status(404).json({
        error: "demo track not bundled",
        cwd: process.cwd(),
        dirname: __dirname,
        tried: candidates,
      });
      return;
    }
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", String(statSync(found).size));
    res.setHeader("Cache-Control", "public, max-age=86400");
    createReadStream(found).pipe(res);
  } catch (err) {
    res.status(500).json({ error: "demo track handler failed", message: err instanceof Error ? err.message : String(err) });
  }
});

healthRouter.get("/welcome.json", (_req: Request, res: Response) => {
  res.json({
    name: "VERSE2",
    description: "Autonomous AI music video creative director. Upload a song, get a complete pre-production package in under a minute.",
    version: "0.1.0",
    category: "Artistic Excellence",
    pricing: {
      package: `${env.x402PackagePrice} USDT0 (x402)`,
      revision: `${env.x402RevisionPrice} USDT0 (x402)`,
    },
    endpoints: {
      health: "GET /health",
      package: "POST /v1/package (x402-gated)",
      job: "GET /v1/jobs/:id",
      revise: "POST /v1/jobs/:id/revise (x402-gated)",
      files: "GET /v1/jobs/:id/files/:filename",
      web_ui: "GET /",
      app: "GET /app/",
    },
    asp_manifest: "/asp.json",
    web_ui_url: "/",
    app_url: "/app/",
  });
});

healthRouter.get("/asp.json", (_req: Request, res: Response) => {
  // Manifest for OKX.AI listing. This is the contract the marketplace reads.
  res.json({
    name: "VERSE2",
    slug: "verse2-music-video-director",
    type: "A2MCP",
    category: "Artistic Excellence",
    description:
      "Autonomous AI music video creative director. Drop a song URL, get a full pre-production package: treatment, scene-by-scene shot list, production schedule, and a deterministic budget that auto-optimizes to fit your cap.",
    pricing: {
      currency: "USDT0",
      per_call: env.x402PackagePrice,
      revision: env.x402RevisionPrice,
    },
    payment: {
      protocol: "x402",
      network: "eip155:196",
      asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
      asset_name: "USDT0",
      pay_to: env.receivingWallet,
    },
    endpoints: {
      invoke: {
        method: "POST",
        path: "/v1/package",
        content_type: "application/json",
        request_schema: {
          audio_url: "string (https URL to mp3/wav/m4a/flac/ogg/aac, ≤60MB)",
          interview: {
            artist_name: "string?",
            track_title: "string?",
            track_genre: "string? (e.g. afrobeats, hiphop, ballad)",
            target_audience: "string?",
            visual_mood: "string? (free text)",
            reference_artists: "string? (comma-separated)",
            budget_currency: "string? (NGN, USD, EUR, GBP — default USD)",
            budget_cap: "number? (in budget_currency)",
            must_haves: "string? (free text)",
          },
          selected_concept_index: "number? (0..2 — default 0)",
          optimize: "boolean? (default true — fit within budget_cap)",
        },
        response_schema: {
          job_id: "string",
          analysis: "object (tempo, segments, energy_curve)",
          concepts: "array of 3 (each with scenes + shots)",
          selected_concept_index: "number",
          cost: "object (lines, subtotal, total, over_budget)",
          schedule: "array of day-cost rows",
          files: {
            treatment_pdf: "URL",
            treatment_html: "URL",
            shot_list_csv: "URL",
            shooting_schedule_csv: "URL",
          },
        },
      },
      revise: {
        method: "POST",
        path: "/v1/jobs/:id/revise",
        body: { revision: "string (free-text directive)" },
      },
    },
    capabilities: [
      "Audio analysis (BPM, structural segmentation, energy curve) via librosa",
      "Multi-concept creative direction (3 distinct visual concepts per track)",
      "Scene-by-scene shot list with timestamp anchors to song segments",
      "Deterministic budget calc across 4 currencies (NGN, USD, EUR, GBP)",
      "Iterative budget optimization with 6 strategies + LLM revision fallback",
      "PDF + HTML treatment, CSV shot list, CSV shooting schedule",
    ],
    limits: {
      max_audio_size_mb: 60,
      max_audio_seconds: 600,
    },
    demo: {
      audio_url: "https://example.com/sample-track.mp3",
      interview: {
        track_genre: "afrobeats",
        visual_mood: "Lagos at dawn, anamorphic, warm",
        budget_currency: "NGN",
        budget_cap: 5_000_000,
      },
    },
  });
});
