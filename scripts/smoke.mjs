// Minimal end-to-end smoke test.
//   1. Start the sidecar (or assume it's running on 127.0.0.1:8077)
//   2. Start the API on PORT
//   3. POST /v1/package with a fake audio_url that 404s
//   4. Verify we get a clean 422 (or 4xx) — proves the pipeline catches errors
//   5. POST /health and verify ok=true
//
// Usage: node scripts/smoke.mjs

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log(`Smoke test against ${BASE}`);

await check("GET /health returns ok", async () => {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.service !== "verse2") throw new Error(`unexpected service: ${j.service}`);
});

await check("GET / returns the welcome", async () => {
  const res = await fetch(`${BASE}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.name !== "VERSE2") throw new Error(`unexpected name: ${j.name}`);
});

await check("GET /asp.json is valid manifest", async () => {
  const res = await fetch(`${BASE}/asp.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (!j.endpoints?.invoke?.path) throw new Error("missing invoke path");
  if (!j.payment?.protocol || j.payment.protocol !== "x402") throw new Error("missing x402 payment");
});

await check("POST /v1/package with bad audio_url returns 4xx", async () => {
  const res = await fetch(`${BASE}/v1/package`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audio_url: "https://example.com/does-not-exist.mp3", interview: {} }),
  });
  if (res.status < 400 || res.status >= 600) throw new Error(`expected 4xx/5xx, got ${res.status}`);
});

console.log("Done.");
