// Express app. Mounts /v1 (package router), / (health, manifest, web UI).
// Serves a proper landing page at / and the wizard at /app/.

import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { packageRouter } from "./routes/package.js";
import { healthRouter } from "./routes/health.js";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, exposedHeaders: ["PAYMENT-REQUIRED", "X-PAYMENT-RECEIPT"] }));
app.use(express.json({ limit: "5mb" }));

app.use(packageRouter);
app.use(healthRouter);

// Static web assets (css/js/images) from /web
const webDir = join(__dirname, "..", "web");
if (existsSync(webDir)) {
  app.use("/web", express.static(webDir));
  app.use("/static", express.static(webDir)); // alias
}

// Landing page at /
app.get("/", (_req, res) => {
  const path = join(webDir, "landing.html");
  if (existsSync(path)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(readFileSync(path));
    return;
  }
  res.status(503).json({ error: "landing page not yet built" });
});

// Wizard at /app/
app.get("/app", (_req, res) => res.redirect(301, "/app/"));
app.get("/app/", (_req, res) => {
  const path = join(webDir, "app.html");
  if (existsSync(path)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(readFileSync(path));
    return;
  }
  res.status(503).json({ error: "app not yet built" });
});

// /web/ still works as a legacy alias (redirects to /)
app.get("/web", (_req, res) => res.redirect(301, "/"));
app.get("/web/", (_req, res) => res.redirect(301, "/"));

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
