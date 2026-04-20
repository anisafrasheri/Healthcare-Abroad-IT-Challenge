import { db } from "@/lib/db/client";

// ── SQL migration ─────────────────────────────────────────────────────────────
//
// CREATE TABLE triage_audit_log (
//   id           SERIAL PRIMARY KEY,
//   case_id      TEXT NOT NULL,
//   user_id      TEXT NOT NULL,
//   success      BOOLEAN NOT NULL,
//   error_reason TEXT,                      -- null on success
//   duration_ms  INTEGER NOT NULL,
//   created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
// );
//
// CREATE INDEX idx_audit_case_id  ON triage_audit_log(case_id);
// CREATE INDEX idx_audit_user_id  ON triage_audit_log(user_id);
// CREATE INDEX idx_audit_created  ON triage_audit_log(created_at DESC);
//
// Rationale: separate from case_triage_results so every attempt is recorded,
// including failures that never produce a result row. Critical for healthcare compliance.

export interface AuditEntry {
  caseId: string;
  userId: string;
  success: boolean;
  errorReason?: string;
  durationMs: number;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO triage_audit_log
       (case_id, user_id, success, error_reason, duration_ms)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.caseId,
      entry.userId,
      entry.success,
      entry.errorReason ?? null,
      entry.durationMs,
    ]
  );
}

export async function getAuditLogsForCase(
  caseId: string,
  limit = 20
): Promise<AuditEntry[]> {
  const rows = await db.queryMany(
    `SELECT case_id, user_id, success, error_reason, duration_ms
     FROM triage_audit_log
     WHERE case_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [caseId, limit]
  );

  return rows.map((r) => ({
    caseId: r.case_id,
    userId: r.user_id,
    success: r.success,
    errorReason: r.error_reason ?? undefined,
    durationMs: r.duration_ms,
  }));
}
