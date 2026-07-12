// VERSE2 landing page JS
// 1. Health badge in the header (polls /health every 30s)
// 2. "Try with demo track" buttons → trigger /v1/package with the demo track,
//    then poll the job and redirect to /app/ when complete
// 3. Audio player: when user plays, "load the package" button becomes active

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---- HEALTH BADGE ----
async function updateStatus() {
  const badge = $("#status-badge");
  if (!badge) return;
  try {
    const res = await fetch("/health", { cache: "no-store" });
    const data = await res.json();
    badge.classList.remove("degraded", "down");
    if (!data.ok) badge.classList.add("degraded");
    if (data.checks?.openai?.ok && data.checks?.sidecar?.ok) {
      badge.querySelector(".dot-text").textContent = "live";
    } else if (data.checks?.sidecar?.ok) {
      badge.querySelector(".dot-text").textContent = "mock mode";
      badge.classList.add("degraded");
    } else {
      badge.querySelector(".dot-text").textContent = "degraded";
      badge.classList.add("degraded");
    }
  } catch (e) {
    badge.classList.add("down");
    badge.querySelector(".dot-text").textContent = "offline";
  }
}
updateStatus();
setInterval(updateStatus, 30_000);

// ---- AUDIO PLAYER INTERACTION ----
const audio = $("#demo-audio");
const playerStatus = $("#player-status");
const triggerBtn = $("#trigger-package");

if (audio && triggerBtn) {
  audio.addEventListener("play", () => {
    if (triggerBtn.disabled) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = "Generate package from this track";
      playerStatus.textContent = "ready to generate";
    }
  });
}

// ---- PROGRESS MESSAGES ----
const STAGES = [
  { ms: 0, msg: "analyzing audio structure (BPM, sections)…" },
  { ms: 8000, msg: "writing 3 visual concepts with the LLM…" },
  { ms: 18000, msg: "computing the deterministic budget…" },
  { ms: 30000, msg: "rendering treatment + shot list + schedule…" },
  { ms: 45000, msg: "still working — full LLM run is slow, hang tight…" },
];

function startProgress(el, prefix = "") {
  let i = 0;
  function tick() {
    if (i >= STAGES.length) return;
    if (el) el.textContent = prefix + STAGES[i].msg;
    i += 1;
    if (i < STAGES.length) setTimeout(tick, STAGES[i].ms - STAGES[i - 1].ms);
  }
  tick();
}

// ---- TRY WITH DEMO TRACK ----
async function tryWithDemo(button) {
  const statusEl = $("#player-status") || playerStatus;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Generating…";
  startProgress(statusEl);

  let jobId = null;
  try {
    const audioUrl = `${window.location.origin}/demo-track.wav`;
    const res = await fetch("/v1/package", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment": "demo-bypass", // demo mode; remove when wallet is connected
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        interview: {
          artist_name: "Wizkid",
          vision: "Nollywood meets Tokyo neon: a love letter to Lagos nightlife. Cinematic anamorphic, electric colors, dancers, water reflections.",
          references: ["Burna Boy - Last Last", "Tems - Replay"],
          budget_cap_usd: 50000,
          shoot_city: "Lagos, Nigeria",
          locations: ["Lekki Phase 1", "Yaba", "Victoria Island"],
          must_haves: "anamorphic lenses, neon, water reflections, drone shot of the city",
        },
      }),
    });

    if (res.status === 402) {
      // The x402 gate is strict (we're in live mode now). For the demo landing page,
      // show a friendly error and link to the app where the user can paste their own URL.
      if (statusEl) statusEl.innerHTML = `payment required — open the <a href="/app/" style="color:var(--accent)">app</a> to connect a wallet and run with your own track.`;
      button.disabled = false;
      button.textContent = original;
      return;
    }
    if (!res.ok) {
      const text = await res.text();
      if (statusEl) statusEl.textContent = `error: ${res.status} ${text.slice(0, 100)}`;
      button.disabled = false;
      button.textContent = original;
      return;
    }

    const job = await res.json();
    jobId = job.job_id;
    if (statusEl) statusEl.innerHTML = `job <code>${jobId.slice(0, 8)}…</code> — finalizing…`;
  } catch (e) {
    if (statusEl) statusEl.textContent = `error: ${e.message}`;
    button.disabled = false;
    button.textContent = original;
    return;
  }

  // Poll for completion
  if (jobId) {
    const start = Date.now();
    const POLL_TIMEOUT = 120_000; // 2 min max
    const POLL_INTERVAL = 1500;
    const poll = setInterval(async () => {
      if (Date.now() - start > POLL_TIMEOUT) {
        clearInterval(poll);
        if (statusEl) statusEl.innerHTML = `still working? <a href="/app/?job=${jobId}" style="color:var(--accent)">open the app</a> to see results.`;
        button.disabled = false;
        button.textContent = original;
        return;
      }
      try {
        const r = await fetch(`/v1/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) return; // try again
        const j = await r.json();
        if (j.status === "complete" || j.result) {
          clearInterval(poll);
          if (statusEl) statusEl.innerHTML = `done — opening full package…`;
          setTimeout(() => {
            window.location.href = `/app/?job=${jobId}`;
          }, 500);
        } else if (j.status === "error") {
          clearInterval(poll);
          if (statusEl) statusEl.textContent = `error: ${j.error || "unknown"}`;
          button.disabled = false;
          button.textContent = original;
        }
      } catch {
        // network blip, keep polling
      }
    }, POLL_INTERVAL);
  }
}

$$("#try-demo, #try-demo-2, #trigger-package").forEach((btn) => {
  if (btn) btn.addEventListener("click", () => tryWithDemo(btn));
});

// ---- OPEN APP LINK SHOULD PRESERVE DEMO-AWARE BEHAVIOR ----
const appLink = $("#app-link");
if (appLink) {
  // No-op; /app/ is a static link. Job redirect happens via tryWithDemo.
}
