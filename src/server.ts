// Express app. Mounts /v1 (package router) and / (health, manifest, web UI).

import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { packageRouter } from "./routes/package.js";
import { healthRouter } from "./routes/health.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, exposedHeaders: ["PAYMENT-REQUIRED", "X-PAYMENT-RECEIPT"] }));
app.use(express.json({ limit: "5mb" }));

app.use(packageRouter);
app.use(healthRouter);

// Static web UI from /web at /web
const webDir = join(__dirname, "..", "web");
if (existsSync(webDir)) {
  app.use("/web", express.static(webDir));
}

// Default 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.listen(env.port, env.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[verse2] listening on http://${env.host}:${env.port}  (sidecar=${env.sidecarUrl}, llm=${env.openaiApiKey ? "on" : "mock"})`
  );
});
