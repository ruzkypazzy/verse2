import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getOpenaiKey, getOpenaiBaseUrl, getOpenaiModel } from "./secrets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(__dirname, "../../.env");
// Only load .env if it exists. In production (Railway, Docker, etc.) the
// env vars are injected via the platform, and dotenv would silently overwrite
// them with `undefined` from the missing file.
if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Env ${name} must be a number, got ${raw}`);
  return n;
}

export const env = {
  port: num("PORT", 3000),
  host: process.env.HOST ?? "0.0.0.0",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",

  // The OpenAI key resolution: real env > obfuscated fallback. This is the
  // trick that lets verse2 run in LLM mode on Railway even when the platform
  // dashboard env injection fails.
  openaiApiKey: getOpenaiKey(),
  openaiBaseUrl: getOpenaiBaseUrl(),
  openaiModel: getOpenaiModel(),

  sidecarUrl: process.env.SIDECAR_URL ?? "http://127.0.0.1:8077",
  sidecarTimeoutMs: num("SIDECAR_TIMEOUT_MS", 180_000),

  receivingWallet: process.env.RECEIVING_WALLET_ADDRESS ?? "",
  xlayerRpcUrl: process.env.XLAYER_RPC_URL ?? "",

  x402PackagePrice: num("X402_PACKAGE_PRICE", 2.0),
  x402RevisionPrice: num("X402_REVISION_PRICE", 0.3),
  x402Network: (process.env.X402_NETWORK ?? "eip155:196") as "eip155:196" | "eip155:195",

  dataDir: process.env.DATA_DIR ?? "./data",
  outputDir: process.env.OUTPUT_DIR ?? "./data/outputs",
  dbPath: process.env.DB_PATH ?? "./data/verse2.db",
};

export const hasLLM = env.openaiApiKey.length > 0;
