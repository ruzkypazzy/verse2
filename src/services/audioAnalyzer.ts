// Wraps the Python audio-analysis sidecar. Downloads the audio to a temp file,
// posts it to the sidecar, and returns the parsed analysis.

import { writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import FormData from "form-data";
import fetch from "node-fetch";

import { env } from "../config/env.js";
import type { AudioAnalysis } from "../types/index.js";

const ALLOWED_EXT = new Set([".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".opus"]);
const MAX_BYTES = 60 * 1024 * 1024;

export async function downloadAudio(url: string): Promise<{ path: string; cleanup: () => Promise<void>; ext: string }> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to download audio: HTTP ${res.status} ${res.statusText}`);

  // Pick an extension from the URL or content-type
  const urlExt = extname(new URL(url).pathname).toLowerCase();
  const ct = res.headers.get("content-type") ?? "";
  let ext = urlExt;
  if (!ext || !ALLOWED_EXT.has(ext)) {
    if (ct.includes("mpeg")) ext = ".mp3";
    else if (ct.includes("wav")) ext = ".wav";
    else if (ct.includes("mp4") || ct.includes("aac")) ext = ".m4a";
    else if (ct.includes("ogg")) ext = ".ogg";
    else if (ct.includes("flac")) ext = ".flac";
    else ext = ".mp3";
  }
  if (!ALLOWED_EXT.has(ext)) ext = ".mp3";

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(`Audio file too large: ${buf.byteLength} bytes (max ${MAX_BYTES})`);
  }
  if (buf.byteLength < 1024) {
    throw new Error(`Audio file too small: ${buf.byteLength} bytes`);
  }

  const path = join(tmpdir(), `verse2-${randomUUID()}${ext}`);
  await writeFile(path, buf);
  return {
    path,
    ext,
    cleanup: async () => {
      try { await unlink(path); } catch { /* ignore */ }
    },
  };
}

export async function analyzeAudio(filePath: string): Promise<AudioAnalysis> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.sidecarTimeoutMs);
  try {
    // Read the file into a Buffer and post as multipart/form-data
    const fs = await import("node:fs/promises");
    const fileBuf = await fs.readFile(filePath);
    const form = new FormData();
    form.append("file", fileBuf, { filename: `audio${extname(filePath)}` });

    const res = await fetch(`${env.sidecarUrl}/analyze`, {
      method: "POST",
      body: form as unknown as Buffer,
      headers: form.getHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Sidecar analyze failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
    }
    return (await res.json()) as AudioAnalysis;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sidecarHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${env.sidecarUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const j = (await res.json()) as { ok?: boolean };
    return j.ok === true;
  } catch {
    return false;
  }
}

// Tiny helper to ensure data dir exists
export async function ensureDataDirs(): Promise<void> {
  await mkdir(env.dataDir, { recursive: true });
  await mkdir(env.outputDir, { recursive: true });
}
