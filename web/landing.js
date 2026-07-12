// VERSE2 landing page JS
// 1. Health badge in the header (polls /health every 30s)
// 2. "Try with demo track" buttons → trigger /v1/package with the demo track
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

// ---- TRY WITH DEMO TRACK ----
async function tryWithDemo(button) {
  const statusEl = $("#player-status") || playerStatus;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Generating…";
  if (statusEl) statusEl.textContent = "running pipeline (analyze → write → price)";

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
      const body = await res.json();
      if (statusEl) statusEl.innerHTML = `payment required: pay ${body.message} — <a href="/app/" style="color:var(--accent)">connect wallet</a>`;
      return;
    }
    if (!res.ok) {
      const text = await res.text();
      if (statusEl) statusEl.textContent = `error: ${res.status} ${text.slice(0, 80)}`;
      return;
    }

    const job = await res.json();
    if (statusEl) statusEl.innerHTML = `generated! job <code>${job.job_id.slice(0, 8)}…</code> · opening app…`;
    // Redirect to the app with the job_id so the user can see the full output
    setTimeout(() => {
      window.location.href = `/app/?job=${job.job_id}`;
    }, 800);
  } catch (e) {
    if (statusEl) statusEl.textContent = `error: ${e.message}`;
    button.disabled = false;
    button.textContent = original;
  }
}

$$("#try-demo, #try-demo-2, #trigger-package").forEach((btn) => {
  if (btn) btn.addEventListener("click", () => tryWithDemo(btn));
});

// ---- UPDATE APP LINK WITH CURRENT ORIGIN ----
const appLink = $("#app-link");
if (appLink) {
  // No-op; href is static. The ?job= query param is added on tryWithDemo redirect.
}
