// Output rendering. Produces:
//  - treatment.pdf (Puppeteer HTML→PDF; if Puppeteer is unavailable, write an HTML fallback)
//  - treatment.html (raw HTML, always available)
//  - shot_list.csv
//  - shooting_schedule.csv
//
// All output files go to env.outputDir. Filenames are scoped by job_id.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../config/env.js";
import type { Concept, CostBreakdown, DayCost, AudioAnalysis, PackageResult } from "../types/index.js";

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function buildTreatmentHtml(
  jobId: string,
  analysis: AudioAnalysis,
  concept: Concept,
  cost: CostBreakdown,
  schedule: DayCost[]
): string {
  const sceneRows = concept.scenes
    .map(
      (s) => `
        <tr>
          <td>${htmlEscape(s.segment_label)}</td>
          <td>${fmtTime(s.segment_start)}–${fmtTime(s.segment_end)}</td>
          <td>${htmlEscape(s.location)}</td>
          <td>${htmlEscape(s.description)}</td>
          <td>${s.cast_size}${s.dancer_count ? ` + ${s.dancer_count} dancers` : ""}</td>
        </tr>`
    )
    .join("");

  const shotRows = concept.scenes
    .flatMap((s) =>
      s.shots.map(
        (sh) => `
        <tr>
          <td>${htmlEscape(s.segment_label)}</td>
          <td>${sh.shot_type}</td>
          <td>${htmlEscape(sh.description)}</td>
          <td>${sh.duration_sec.toFixed(1)}s</td>
          <td>${htmlEscape(sh.camera_movement)}</td>
        </tr>`
      )
    )
    .join("");

  const costRows = cost.lines
    .map(
      (l) => `
        <tr>
          <td>${htmlEscape(l.category)}</td>
          <td>${htmlEscape(l.description)}</td>
          <td>${l.quantity}</td>
          <td>${fmtMoney(l.unit_cost, l.currency)}</td>
          <td>${fmtMoney(l.total, l.currency)}</td>
        </tr>`
    )
    .join("");

  const scheduleRows = schedule
    .map(
      (d) => `
        <tr>
          <td>Day ${d.day}</td>
          <td>${htmlEscape(d.location)}</td>
          <td>${d.scene_indices.map((i) => `#${i + 1}`).join(", ")}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>VERSE2 — ${htmlEscape(concept.title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font: 14px/1.55 -apple-system, "SF Pro Text", Helvetica, Arial, sans-serif; max-width: 880px; margin: 0 auto; padding: 32px; color: #1a1a1a; }
    h1 { font-size: 32px; margin: 0 0 4px; letter-spacing: -0.02em; }
    h2 { font-size: 18px; margin: 28px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    h3 { font-size: 16px; margin: 16px 0 4px; }
    .meta { color: #666; font-size: 12px; }
    .logline { font-size: 16px; font-style: italic; color: #333; margin: 8px 0 16px; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f0f0f0; font-size: 11px; margin-right: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
    th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; vertical-align: top; }
    th { background: #fafafa; font-weight: 600; color: #555; }
    .totals td { font-weight: 600; border-top: 2px solid #999; }
    .footer { margin-top: 40px; color: #999; font-size: 11px; border-top: 1px solid #eee; padding-top: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>${htmlEscape(concept.title)}</h1>
    <div class="logline">${htmlEscape(concept.logline)}</div>
    <div class="meta">
      Job ${jobId} · ${analysis.tempo.toFixed(0)} BPM · ${(analysis.duration / 60).toFixed(1)} min ·
      Segmentation method: ${htmlEscape(analysis.method)}
    </div>
  </header>

  <h2>Treatment</h2>
  <p><strong>Visual style.</strong> ${htmlEscape(concept.visual_style)}</p>
  <p><strong>Pacing.</strong> ${htmlEscape(concept.pacing)}</p>

  <h2>Scenes</h2>
  <table>
    <thead><tr><th>Section</th><th>Time</th><th>Location</th><th>Action</th><th>Cast</th></tr></thead>
    <tbody>${sceneRows}</tbody>
  </table>

  <h2>Shot List</h2>
  <table>
    <thead><tr><th>Section</th><th>Type</th><th>Description</th><th>Dur</th><th>Camera</th></tr></thead>
    <tbody>${shotRows}</tbody>
  </table>

  <h2>Budget</h2>
  <table>
    <thead><tr><th>Category</th><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
    <tbody>${costRows}</tbody>
    <tr class="totals">
      <td colspan="4">Subtotal</td>
      <td>${fmtMoney(cost.subtotal, cost.currency)}</td>
    </tr>
    <tr>
      <td colspan="4">Misc (${(cost.misc / Math.max(cost.subtotal, 1) * 100).toFixed(0)}%)</td>
      <td>${fmtMoney(cost.misc, cost.currency)}</td>
    </tr>
    <tr class="totals">
      <td colspan="4">Total</td>
      <td>${fmtMoney(cost.total, cost.currency)}</td>
    </tr>
  </table>
  ${
    cost.budget_cap != null
      ? `<p class="meta">Budget cap: ${fmtMoney(cost.budget_cap, cost.currency)} · ${
          cost.over_budget ? "OVER BUDGET" : "WITHIN BUDGET"
        } · ${cost.optimization_attempts} optimization pass(es)</p>`
      : ""
  }

  <h2>Shooting Schedule</h2>
  <table>
    <thead><tr><th>Day</th><th>Location</th><th>Scenes</th></tr></thead>
    <tbody>${scheduleRows}</tbody>
  </table>

  <div class="footer">
    Generated by VERSE2 · job_id=${jobId} · pricing in ${cost.currency}
  </div>
</body>
</html>`;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildShotListCsv(concept: Concept): string {
  const header = ["scene_index", "section", "shot_index", "shot_type", "duration_sec", "camera_movement", "description"];
  const rows: string[] = [header.join(",")];
  for (const s of concept.scenes) {
    for (const sh of s.shots) {
      rows.push(
        [
          s.index,
          csvEscape(s.segment_label),
          sh.index,
          csvEscape(sh.shot_type),
          sh.duration_sec,
          csvEscape(sh.camera_movement),
          csvEscape(sh.description),
        ].join(",")
      );
    }
  }
  return rows.join("\n") + "\n";
}

export function buildScheduleCsv(schedule: DayCost[]): string {
  const header = ["day", "location", "scene_indices"];
  const rows: string[] = [header.join(",")];
  for (const d of schedule) {
    rows.push([d.day, csvEscape(d.location), csvEscape(d.scene_indices.join(" "))].join(","));
  }
  return rows.join("\n") + "\n";
}

export interface OutputPaths {
  treatment_html: string;
  treatment_pdf: string;
  shot_list_csv: string;
  shooting_schedule_csv: string;
}

export async function renderOutputs(
  jobId: string,
  result: Omit<PackageResult, "files" | "job_id" | "created_at">
): Promise<OutputPaths> {
  await mkdir(env.outputDir, { recursive: true });

  const concept = result.concepts[result.selected_concept_index] ?? result.concepts[0];
  const html = buildTreatmentHtml(
    jobId,
    result.analysis,
    concept,
    result.cost,
    result.schedule
  );
  const htmlPath = join(env.outputDir, `${jobId}-treatment.html`);
  await writeFile(htmlPath, html, "utf8");

  const csvPath = join(env.outputDir, `${jobId}-shot_list.csv`);
  await writeFile(csvPath, buildShotListCsv(concept), "utf8");

  const schedPath = join(env.outputDir, `${jobId}-shooting_schedule.csv`);
  await writeFile(schedPath, buildScheduleCsv(result.schedule), "utf8");

  // PDF: try Puppeteer. If it fails (e.g. no Chromium in the env), keep the HTML.
  const pdfPath = join(env.outputDir, `${jobId}-treatment.pdf`);
  let pdfWritten = false;
  try {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" } });
      pdfWritten = true;
    } finally {
      await browser.close();
    }
  } catch (err) {
    // Fall back: write a tiny note in place of the PDF
    await writeFile(
      pdfPath,
      `PDF generation unavailable in this environment. See ${jobId}-treatment.html for the full document.\n`,
      "utf8"
    );
  }

  // Build the public URLs
  const base = env.publicBaseUrl.replace(/\/$/, "");
  return {
    treatment_html: `${base}/v1/jobs/${jobId}/files/treatment.html`,
    treatment_pdf: `${base}/v1/jobs/${jobId}/files/${pdfWritten ? "treatment.pdf" : "treatment.html"}`,
    shot_list_csv: `${base}/v1/jobs/${jobId}/files/shot_list.csv`,
    shooting_schedule_csv: `${base}/v1/jobs/${jobId}/files/shooting_schedule.csv`,
  };
}
