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
  app.use("/web", express.static(webDir, { index: false })); // no index.html auto-serve
  app.use("/static", express.static(webDir, { index: false }));
}

// Serve favicon and OG image at root for the landing page meta tags
app.get("/favicon.svg", (_req, res) => {
  const path = join(webDir, "favicon.svg");
  if (existsSync(path)) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(readFileSync(path));
    return;
  }
  res.status(404).end();
});
app.get("/og-image.png", (_req, res) => {
  const path = join(webDir, "og-image.png");
  if (existsSync(path)) {
    res.setHeader("Content-Type", "image/png");
    res.send(readFileSync(path));
    return;
  }
  res.status(404).end();
});

// Serve the 1080x1080 brand logo at /logo.png, /avatar.png, and /favicon.ico.
// This is the same logo the OKX.AI listing uses for agent 5212.
app.get(["/logo.png", "/avatar.png", "/favicon.ico"], (_req, res) => {
  const logoPath = join(webDir, "verse2-avatar-1080.png");
  if (existsSync(logoPath)) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(readFileSync(logoPath));
    return;
  }
  res.status(404).end();
});

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
const appHandler = (_req: express.Request, res: express.Response) => {
  const path = join(webDir, "app.html");
  if (existsSync(path)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(readFileSync(path));
    return;
  }
  res.status(503).json({ error: "app not yet built" });
};
app.get(["/app", "/app/"], appHandler);

// /web/ legacy alias (redirects to /) - only the no-slash form
app.get("/web", (_req, res) => res.redirect(301, "/"));

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
// rebuilt 2026-07-15T17:35:35Z
// deploy trigger 1784193140

// force-rebuild for x402 fix 1784193775.1324968