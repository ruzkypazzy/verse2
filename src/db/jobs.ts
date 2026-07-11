// SQLite-backed job store. Synchronous better-sqlite3 — fine for this scale.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env.js";
import type { PackageJob, PackageResult } from "../types/index.js";

let db: Database.Database;

function init(): Database.Database {
  mkdirSync(dirname(env.dbPath), { recursive: true });
  const d = new Database(env.dbPath);
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return d;
}

export function getDb(): Database.Database {
  if (!db) db = init();
  return db;
}

export function createJob(jobId: string): PackageJob {
  const now = new Date().toISOString();
  const job: PackageJob = {
    job_id: jobId,
    status: "queued",
    progress: 0,
    result_json: null,
    error: null,
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(
      `INSERT INTO jobs (job_id, status, progress, result_json, error, created_at, updated_at)
       VALUES (@job_id, @status, @progress, @result_json, @error, @created_at, @updated_at)`
    )
    .run(job);
  return job;
}

export function updateJobStatus(
  jobId: string,
  status: PackageJob["status"],
  progress: number
): void {
  getDb()
    .prepare(`UPDATE jobs SET status = ?, progress = ?, updated_at = ? WHERE job_id = ?`)
    .run(status, progress, new Date().toISOString(), jobId);
}

export function setJobResult(jobId: string, result: PackageResult): void {
  getDb()
    .prepare(
      `UPDATE jobs SET status = 'complete', progress = 100, result_json = ?, updated_at = ? WHERE job_id = ?`
    )
    .run(JSON.stringify(result), new Date().toISOString(), jobId);
}

export function setJobError(jobId: string, message: string): void {
  getDb()
    .prepare(
      `UPDATE jobs SET status = 'error', error = ?, updated_at = ? WHERE job_id = ?`
    )
    .run(message.slice(0, 2000), new Date().toISOString(), jobId);
}

export function getJob(jobId: string): PackageJob | null {
  const row = getDb()
    .prepare(`SELECT job_id, status, progress, result_json, error, created_at, updated_at FROM jobs WHERE job_id = ?`)
    .get(jobId) as PackageJob | undefined;
  return row ?? null;
}
