import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/case-triage/[id]/analyze/route";

// ── Mock all external dependencies ───────────────────────────────────────────

vi.mock("@/lib/auth/permissions", () => ({
  requireAdminPermission: vi.fn(),
  AuthError: class AuthError extends Error {
    constructor(msg: string) { super(msg); this.name = "AuthError"; }
  },
}));

vi.mock("@/lib/ai/triageService", () => ({
  analyzeCase: vi.fn(),
  analyzeCaseStream: vi.fn(),
}));

vi.mock("@/lib/db/triageRepository", () => ({
  saveTriageResult: vi.fn(),
}));

vi.mock("@/lib/db/auditRepository", () => ({
  writeAuditLog: vi.fn(),
}));

// ── Import mocks after vi.mock declarations ───────────────────────────────────
import { requireAdminPermission, AuthError } from "@/lib/auth/permissions";
import { analyzeCase } from "@/lib/ai/triageService";
import { saveTriageResult } from "@/lib/db/triageRepository";
import { writeAuditLog } from "@/lib/db/auditRepository";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const MOCK_USER = { id: "user-123", role: "admin", permissions: ["triage:write"] };

const MOCK_RESULT = {
  caseId:        "case-abc",
  summary:       "Patient requires urgent follow-up.",
  priority:      "High" as const,
  tags:          ["urgent_follow_up", "blood_pressure", "medication_review"],
  confidence:    87,
  modelUsed:     "claude-sonnet-4-20250514",
  promptVersion: "triage-v1.1",
  createdAt:     "2025-01-01T00:00:00.000Z",
};

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/admin/case-triage/case-abc/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ROUTE_PARAMS = { params: { id: "case-abc" } };

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/case-triage/[id]/analyze", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it("returns 200 with full TriageResult on valid request", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);
    vi.mocked(analyzeCase).mockResolvedValue(MOCK_RESULT);
    vi.mocked(saveTriageResult).mockResolvedValue(undefined);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ noteText: "Patient note here." }), ROUTE_PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary).toBe(MOCK_RESULT.summary);
    expect(body.priority).toBe("High");
    expect(body.tags).toHaveLength(3);
    expect(body.confidence).toBe(87);
    expect(body.modelUsed).toBeDefined();
    expect(body.promptVersion).toBeDefined();
  });

  it("calls analyzeCase with the correct noteText and caseId", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);
    vi.mocked(analyzeCase).mockResolvedValue(MOCK_RESULT);
    vi.mocked(saveTriageResult).mockResolvedValue(undefined);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);

    await POST(makeRequest({ noteText: "Specific note text." }), ROUTE_PARAMS);

    expect(analyzeCase).toHaveBeenCalledWith("Specific note text.", "case-abc");
  });

  it("writes a success audit log entry", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);
    vi.mocked(analyzeCase).mockResolvedValue(MOCK_RESULT);
    vi.mocked(saveTriageResult).mockResolvedValue(undefined);
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);

    await POST(makeRequest({ noteText: "Patient note." }), ROUTE_PARAMS);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "case-abc", userId: "user-123", success: true })
    );
  });

  // ── Auth failures ───────────────────────────────────────────────────────────

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new AuthError("Unauthenticated"));

    const res = await POST(makeRequest({ noteText: "Note." }), ROUTE_PARAMS);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthenticated");
  });

  it("returns 403 when user lacks permission", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(
      new AuthError("Forbidden: insufficient permissions")
    );

    const res = await POST(makeRequest({ noteText: "Note." }), ROUTE_PARAMS);
    expect(res.status).toBe(403);
  });

  // ── Input validation failures ───────────────────────────────────────────────

  it("returns 400 when noteText is missing", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);

    const res = await POST(makeRequest({}), ROUTE_PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 400 when noteText is blank", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);

    const res = await POST(makeRequest({ noteText: "   " }), ROUTE_PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is not valid JSON", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);

    const req = new NextRequest(
      "http://localhost/api/admin/case-triage/case-abc/analyze",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "not-json" }
    );

    const res = await POST(req, ROUTE_PARAMS);
    expect(res.status).toBe(400);
  });

  // ── AI failure ──────────────────────────────────────────────────────────────

  it("returns 502 when AI service throws", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);
    vi.mocked(analyzeCase).mockRejectedValue(new Error("AI service unavailable"));

    const res = await POST(makeRequest({ noteText: "Patient note." }), ROUTE_PARAMS);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toContain("Analysis failed");
  });

  it("writes a failure audit log when AI throws", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);
    vi.mocked(analyzeCase).mockRejectedValue(new Error("AI down"));
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);

    await POST(makeRequest({ noteText: "Patient note." }), ROUTE_PARAMS);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, errorReason: expect.stringContaining("AI down") })
    );
  });

  // ── DB failure is non-fatal ─────────────────────────────────────────────────

  it("still returns 200 when DB persist fails", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(MOCK_USER);
    vi.mocked(analyzeCase).mockResolvedValue(MOCK_RESULT);
    vi.mocked(saveTriageResult).mockRejectedValue(new Error("DB connection lost"));
    vi.mocked(writeAuditLog).mockResolvedValue(undefined);

    const res = await POST(makeRequest({ noteText: "Patient note." }), ROUTE_PARAMS);

    // DB failure must not surface to the user
    expect(res.status).toBe(200);
  });
});
