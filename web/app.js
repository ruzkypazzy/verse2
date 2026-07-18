// Verse2 single-page app. 4-step flow: audio → interview → loading → results.
// Talks to /v1/package directly. Payment is via x402 — for the demo we just
// let the request through (gate is logged-but-not-blocking in mock mode).

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  audioUrl: "",
  interview: {},
  result: null,
  selectedConcept: 0,
  useBypass: false, // true when "Use demo (free)" was clicked; sends x-payment bypass header
};

function showStep(n) {
  $$(".step").forEach((el) => el.classList.add("hidden"));
  $(`#step-${n}`).classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtMoney(n, c) {
  try {
    return `${c} ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  } catch {
    return `${c} ${n}`;
  }
}

// Step 1 → 2
$("#form-audio").addEventListener("submit", (e) => {
  e.preventDefault();
  state.audioUrl = $("#audio-url").value.trim();
  if (!state.audioUrl) return;
  showStep(2);
});

// If we landed here with ?job=<id> (from the landing page CTA),
// show the result for that job directly.
const urlJobId = new URLSearchParams(window.location.search).get("job");
if (urlJobId) {
  state.audioUrl = "(loaded from landing page)";
  showStep(3);
  startJobViewer(urlJobId);
}

// ---- DEMO MODE TOGGLE ----
// "Use demo (free)" in the banner — allows the wizard to run without payment.
function setDemoMode(on) {
  state.useBypass = on;
  const banner = $("#pay-banner");
  const headline = $("#banner-headline");
  const sub = $("#banner-sub");
  if (!banner || !headline || !sub) return;
  if (on) {
    banner.classList.add("demo-mode");
    headline.textContent = "Demo mode (free)";
    sub.textContent = "Running without x402 payment. No wallet needed.";
  } else {
    banner.classList.remove("demo-mode");
    headline.textContent = "Pay per call: 2 USDT0 via x402 on X Layer";
    sub.textContent = "0.3 USDT0 per revision · 0.001 USDT0 ≈ nothing for a full package";
  }
}

$("#banner-use-demo")?.addEventListener("click", () => {
  setDemoMode(true);
  const audioInput = $("#audio-url");
  if (audioInput) {
    audioInput.value = window.location.origin + "/demo-track.wav";
  }
});

// "Use marketplace" in the banner — open the OKX.AI marketplace for VERSE2
// Direct agent page (works once VERSE2 is listed in the marketplace).
$("#banner-use-marketplace")?.addEventListener("click", () => {
  window.open("https://www.okx.ai/agents/5212", "_blank", "noopener");
});

// "Try the demo track for free" link in the step-1 form
$("#use-demo-track")?.addEventListener("click", () => {
  setDemoMode(true);
  const audioInput = $("#audio-url");
  if (audioInput) {
    audioInput.value = window.location.origin + "/demo-track.wav";
  }
});

// Step 2 → 3
$("#form-interview").addEventListener("submit", async (e) => {
  e.preventDefault();
  state.interview = {
    artist_name: $("#i-artist").value.trim() || undefined,
    track_title: $("#i-title").value.trim() || undefined,
    track_genre: $("#i-genre").value.trim() || undefined,
    budget_currency: $("#i-currency").value,
    budget_cap: $("#i-budget").value ? Number($("#i-budget").value) : undefined,
    visual_mood: $("#i-mood").value.trim() || undefined,
    reference_artists: $("#i-refs").value.trim() || undefined,
    must_haves: $("#i-must").value.trim() || undefined,
  };
  showStep(3);
  await runPackage();
});

$("#back-1").addEventListener("click", () => showStep(1));
$("#back-2").addEventListener("click", () => {
  state.result = null;
  showStep(1);
});

const loadingMessages = [
  "Listening to your track…",
  "Mapping structure & energy curve…",
  "Directing 3 visual concepts…",
  "Computing budget & schedule…",
];

async function runPackage() {
  const bar = $("#bar");
  const msg = $("#loading-msg");
  const det = $("#loading-detail");
  let pct = 5;
  const tick = setInterval(() => {
    pct = Math.min(90, pct + 4);
    bar.style.width = pct + "%";
    const i = Math.min(loadingMessages.length - 1, Math.floor(pct / 25));
    msg.textContent = loadingMessages[i];
    det.textContent = `Audio analysis · stage ${i + 1} of ${loadingMessages.length}`;
  }, 600);

  try {
    const headers = { "content-type": "application/json" };
    if (state.useBypass) {
      // Demo mode — server accepts this header in lieu of a real x402 signature
      headers["x-payment"] = "demo-bypass";
    }
    const res = await fetch("/v1/package", {
      method: "POST",
      headers,
      body: JSON.stringify({
        audio_url: state.audioUrl,
        interview: state.interview,
      }),
    });
    clearInterval(tick);
    if (res.status === 402 && !state.useBypass) {
      // Real x402 challenge returned. Show marketplace CTA.
      const challenge = await res.json().catch(() => ({}));
      const cost = challenge?.challenge?.accepts?.[0];
      bar.style.width = "100%";
      msg.textContent = "Payment required (x402 v2)";
      const costStr = cost ? `${(Number(cost.amount) / 1_000_000).toFixed(2)} ${cost.extra?.name || "USDT0"}` : "2 USDT0";
      det.innerHTML = `This call costs ${costStr} on ${cost?.network || "eip155:196"}.<br>` +
        `<strong>Two ways to pay:</strong><br>` +
        `&nbsp;&nbsp;1. Open the <a href="https://www.okx.ai/" target="_blank" rel="noopener" style="color:var(--accent)">OKX.AI marketplace</a> to invoke VERSE2 from there (wallet pre-authorized).<br>` +
        `&nbsp;&nbsp;2. Or click <button id="fallback-demo" class="link-btn" style="color:var(--accent)">try the demo (free)</button> to run without payment.`;
      const fallback = $("#fallback-demo");
      if (fallback) {
        fallback.addEventListener("click", () => {
          setDemoMode(true);
          runPackage();
        });
      }
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      bar.style.width = "100%";
      msg.textContent = "Something went wrong";
      det.textContent = err.message || `HTTP ${res.status}`;
      return;
    }
    bar.style.width = "100%";
    state.result = await res.json();
    state.selectedConcept = state.result.selected_concept_index ?? 0;
    renderResults();
    showStep(4);
  } catch (err) {
    clearInterval(tick);
    bar.style.width = "100%";
    msg.textContent = "Network error";
    det.textContent = String(err);
  }
}

function renderResults() {
  const r = state.result;
  if (!r) return;
  $("#r-title").textContent = `Treatment — ${(r.concepts[state.selectedConcept] || {}).title || ""}`;
  const a = r.analysis;
  $("#r-meta").textContent = `${a.tempo.toFixed(0)} BPM · ${(a.duration / 60).toFixed(1)} min · ${a.segments.length} sections · ${a.method}`;

  $("#dl-pdf").href = r.files.treatment_pdf;
  $("#dl-html").href = r.files.treatment_html;
  $("#dl-shots").href = r.files.shot_list_csv;
  $("#dl-sched").href = r.files.shooting_schedule_csv;

  // Concept cards
  const wrap = $("#concepts");
  wrap.innerHTML = "";
  r.concepts.forEach((c, i) => {
    const card = document.createElement("div");
    card.className = "concept" + (i === state.selectedConcept ? " selected" : "");
    card.innerHTML = `
      <h4>${escapeHtml(c.title)}</h4>
      <p class="logline">${escapeHtml(c.logline)}</p>
      <p class="meta">${c.scenes.length} scenes · ${c.scenes.reduce((a, s) => a + s.shots.length, 0)} shots</p>
    `;
    card.addEventListener("click", () => {
      state.selectedConcept = i;
      renderResults();
    });
    wrap.appendChild(card);
  });

  // Selected concept detail
  renderConceptDetail(r.concepts[state.selectedConcept]);

  // Cost
  const cost = r.cost;
  const lines = $("#cost-lines");
  lines.innerHTML = cost.lines
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.category)}</td>
        <td>${escapeHtml(l.description)}</td>
        <td>${l.quantity}</td>
        <td>${fmtMoney(l.unit_cost, l.currency)}</td>
        <td>${fmtMoney(l.total, l.currency)}</td>
      </tr>`
    )
    .join("");
  $("#cost-subtotal").textContent = fmtMoney(cost.subtotal, cost.currency);
  $("#cost-misc").textContent = fmtMoney(cost.misc, cost.currency);
  $("#cost-total").textContent = fmtMoney(cost.total, cost.currency);
  $("#budget-status").textContent =
    cost.budget_cap != null
      ? `Budget cap ${fmtMoney(cost.budget_cap, cost.currency)} · ${cost.over_budget ? "OVER BUDGET" : "WITHIN BUDGET"} · ${cost.optimization_attempts} optimization pass${cost.optimization_attempts === 1 ? "" : "es"}`
      : `Pricing in ${cost.currency}`;
}

function renderConceptDetail(c) {
  let detail = $("#concept-detail");
  if (!detail) {
    detail = document.createElement("div");
    detail.id = "concept-detail";
    detail.className = "concept-detail";
    $("#concepts").after(detail);
  }
  detail.innerHTML = `
    <h3>${escapeHtml(c.title)}</h3>
    <p class="meta">${escapeHtml(c.visual_style)}</p>
    <p>${escapeHtml(c.pacing)}</p>
    <div class="scenes">
      ${c.scenes
        .map(
          (s) => `
        <div class="scene">
          <div class="scene-head">
            <h5>${escapeHtml(s.segment_label)}</h5>
            <span class="time">${fmtTime(s.segment_start)} – ${fmtTime(s.segment_end)}</span>
          </div>
          <div class="loc">📍 ${escapeHtml(s.location)}</div>
          <div class="desc">${escapeHtml(s.description)}</div>
          <div class="shots">
            ${s.shots
              .map(
                (sh) => `
              <div class="shot">
                <span class="type">${escapeHtml(sh.shot_type)}</span>
                <span>${escapeHtml(sh.description)}</span>
                <span class="dur">${sh.duration_sec.toFixed(1)}s</span>
                <span style="color: var(--muted);">${escapeHtml(sh.camera_movement)}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---- VIEW AN EXISTING JOB (used when landing page redirects with ?job=) ----
function startJobViewer(jobId) {
  const loadingMsg = $("#loading-msg");
  const loadingDetail = $("#loading-detail");
  const bar = $("#bar");
  if (loadingMsg) loadingMsg.textContent = `Loading job ${jobId.slice(0, 8)}…`;
  if (loadingDetail) loadingDetail.textContent = "fetching from server…";
  if (bar) bar.style.width = "30%";

  const start = Date.now();
  const POLL_TIMEOUT = 120_000;
  const POLL_INTERVAL = 1500;

  const stages = [
    { at: 0, msg: "fetching from server…", bar: 30 },
    { at: 5000, msg: "audio analysis…", bar: 50 },
    { at: 12000, msg: "writing visual concepts (LLM)…", bar: 70 },
    { at: 25000, msg: "computing budget + schedule…", bar: 85 },
    { at: 40000, msg: "rendering treatment + shot list…", bar: 95 },
  ];
  let stageIdx = 0;
  function tickStage() {
    if (stageIdx >= stages.length) return;
    const s = stages[stageIdx];
    if (Date.now() - start >= s.at) {
      if (loadingDetail) loadingDetail.textContent = s.msg;
      if (bar) bar.style.width = s.bar + "%";
      stageIdx += 1;
    }
    if (stageIdx < stages.length) setTimeout(tickStage, 500);
  }
  setTimeout(tickStage, 100);

  const poll = setInterval(async () => {
    if (Date.now() - start > POLL_TIMEOUT) {
      clearInterval(poll);
      if (loadingMsg) loadingMsg.textContent = "Taking longer than expected";
      if (loadingDetail) loadingDetail.textContent = "The LLM run is slow. Refresh the page in a minute, or check the link in your dashboard.";
      return;
    }
    try {
      const r = await fetch(`/v1/jobs/${jobId}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (j.status === "complete" || j.result) {
        clearInterval(poll);
        state.result = j.result;
        if (bar) bar.style.width = "100%";
        renderResults();
        showStep(4);
      } else if (j.status === "error") {
        clearInterval(poll);
        if (loadingMsg) loadingMsg.textContent = "Generation failed";
        if (loadingDetail) loadingDetail.textContent = j.error || "Unknown error — try again.";
      } else {
        if (loadingDetail) loadingDetail.textContent = `status: ${j.status || "running"}…`;
      }
    } catch {
      // network blip, keep polling
    }
  }, POLL_INTERVAL);
}
