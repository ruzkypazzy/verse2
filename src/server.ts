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
import { handleMcpRequest, handlePaymentVerify } from "./mcp/http.js";
import { x402PackageGate } from "./x402/wrapper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // behind nginx - allows req.protocol to be https
app.use(
  cors({
    origin: true,
    exposedHeaders: [
      "PAYMENT-REQUIRED",
      "X-PAYMENT-RECEIPT",
      "WWW-Authenticate",
      "X-Payment-Required",
      "X-Payment-Protocol",
      "X-Payment-Version",
      "X-Payment-Endpoint",
    ],
  }),
);
// JSON body parser for most routes. The MCP endpoint also reads JSON
// so this is fine. We bump the limit because audio_url strings + base64
// interview payloads can be ~1MB.
app.use(express.json({ limit: "5mb" }));

// MCP-over-HTTP (A2MCP) endpoint. The OKX.AI marketplace reviewer
// prompts the agent via this endpoint using standard JSON-RPC 2.0.
  // A2A / Agent Card discovery endpoint. Per the latest A2A spec,
  // served at /.well-known/agent.json.
  app.get("/.well-known/agent.json", (_req, res) => {
    res.json({
      name: "VERSE2",
      description: "Autonomous AI music video creative director.",
      url: env.publicBaseUrl,
      version: "1.0.0",
      provider: { organization: "ruzkypazzy", url: "https://github.com/ruzkypazzy/verse2" },
      capabilities: { streaming: false, pushNotifications: false, stateTransition: false },
      authentication: { schemes: ["x402"], x402Version: 2, network: env.x402Network, asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736", payTo: env.receivingWallet, facilitator: "https://web3.okx.com" },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json", "application/pdf", "text/html"],
      skills: [
        { id: "create_music_video_package", name: "create_music_video_package", description: "Generate a music video pre-production package.", tags: ["video", "music", "creative"], pricing: { amount: String(Math.round(env.x402PackagePrice * 1_000_000)), asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736", network: env.x402Network, decimals: 6 } },
        { id: "revise_music_video_package", name: "revise_music_video_package", description: "Revise a music video package.", tags: ["video", "music", "revision"], pricing: { amount: String(Math.round(env.x402RevisionPrice * 1_000_000)), asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736", network: env.x402Network, decimals: 6 } }
      ]
    });
  });
  app.get("/agent-card", (_req, res) => res.redirect(301, "/.well-known/agent.json"));

  // Health + readiness endpoints
  app.get("/ready", (_req, res) => res.json({ ok: true, ts: Date.now() }));
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      agent: "VERSE2",
      payments: "live",
      network: env.x402Network,
      facilitator: "OKX Payment SDK",
      x402Version: 2,
    }),
  );

  app.post("/mcp", x402PackageGate(), handleMcpRequest);

// Payment verification endpoint. The OKX.AI marketplace calls this
// after the buyer's wallet signs the 402 challenge, passing the
// paymentId + proof. We mark the paymentId as used so the same
// payment can't be replayed.
app.post("/v1/payment/verify", handlePaymentVerify);

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
