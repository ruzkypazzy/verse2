import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env") });

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

  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

  sidecarUrl: process.env.SIDECAR_URL ?? "http://127.0.0.1:8077",
  sidecarTimeoutMs: num("SIDECAR_TIMEOUT_MS", 180_000),

  receivingWallet: process.env.RECEIVING_WALLET_ADDRESS ?? "",
  xlayerRpcUrl: process.env.XLAYER_RPC_URL ?? "",

  x402PackagePrice: num("X402_PACKAGE_PRICE", 2.0),
  x402RevisionPrice: num("X402_REVISION_PRICE", 0.3),

  dataDir: process.env.DATA_DIR ?? "./data",
  outputDir: process.env.OUTPUT_DIR ?? "./data/outputs",
  dbPath: process.env.DB_PATH ?? "./data/verse2.db",
};

export const hasLLM = env.openaiApiKey.length > 0;
