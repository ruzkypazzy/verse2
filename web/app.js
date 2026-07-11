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
    const res = await fetch("/v1/package", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: state.audioUrl,
        interview: state.interview,
      }),
    });
    clearInterval(tick);
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
