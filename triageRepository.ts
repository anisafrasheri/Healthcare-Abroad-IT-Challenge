import { db } from "@/lib/db/client"; // your existing DB client
import { TriageResult } from "@/types/triage";

// ── SQL migration ─────────────────────────────────────────────────────────────
//
// CREATE TABLE case_triage_results (
//   id             SERIAL PRIMARY KEY,
//   case_id        TEXT NOT NULL,
//   summary        TEXT NOT NULL,
//   priority       TEXT NOT NULL,
//   tags           TEXT[] NOT NULL,
//   confidence     INTEGER NOT NULL,
//   model_used     TEXT NOT NULL,
//   prompt_version TEXT NOT NULL,
//   created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
//   created_by     TEXT NOT NULL
// );
//
// CREATE INDEX idx_triage_case_id ON case_triage_results(case_id);

export async function saveTriageResult(
  result: TriageResult,
  createdBy: string
): Promise<void> {
  await db.query(
    `INSERT INTO case_triage_results
       (case_id, summary, priority, tags, confidence, model_used, prompt_version, created_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      result.caseId,
      result.summary,
      result.priority,
      result.tags,
      result.confidence,
      result.modelUsed,
      result.promptVersion,
      result.createdAt,
      createdBy,
    ]
  );
}

export async function getLatestTriageResult(
  caseId: string
): Promise<TriageResult | null> {
  const row = await db.queryOne(
    `SELECT *
     FROM case_triage_results
     WHERE case_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [caseId]
  );

  if (!row) return null;

  return {
    caseId:        row.case_id,
    summary:       row.summary,
    priority:      row.priority,
    tags:          row.tags,
    confidence:    row.confidence,
    modelUsed:     row.model_used,
    promptVersion: row.prompt_version,
    createdAt:     row.created_at,
  };
}
