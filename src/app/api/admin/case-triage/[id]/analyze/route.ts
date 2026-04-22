import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, AuthError } from "@/lib/auth/permissions";
import { analyzeCase, analyzeCaseStream } from "@/lib/ai/triageService";
import { saveTriageResult } from "@/lib/db/triageRepository";
import { writeAuditLog } from "@/lib/db/auditRepository";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const startedAt = Date.now();

  // 1. Auth + permission check
  let user: { id: string };
  try {
    user = await requireAdminPermission("triage:write");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.message === "Unauthenticated" ? 401 : 403 }
      );
    }
    return NextResponse.json({ error: "Auth error" }, { status: 500 });
  }

  // 2. Validate input
  const caseId = params.id;
  if (!caseId?.trim()) {
    return NextResponse.json({ error: "Missing caseId" }, { status: 400 });
  }

  let noteText: string;
  let stream: boolean;
  try {
    const body = await req.json();
    noteText = body?.noteText;
    // Streaming is explicit opt-in — default is the structured JSON path
    stream = body?.stream === true;
    if (!noteText?.trim()) throw new Error("empty");
  } catch {
    return NextResponse.json(
      { error: "Request body must include noteText" },
      { status: 400 }
    );
  }

  // 3a. Streaming path — opt-in only, not the UI default
  if (stream) {
    try {
      const readable = await analyzeCaseStream(
        noteText,
        caseId,
        async (result) => {
          await saveTriageResult(result, user.id);
          await writeAuditLog({
            caseId,
            userId: user.id,
            success: true,
            durationMs: Date.now() - startedAt,
          });
        }
      );

      return new NextResponse(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "X-Prompt-Version": "triage-v1.1",
        },
      });
    } catch (err) {
      console.error("[analyze route] Stream setup failed:", err);
      await writeAuditLog({
        caseId, userId: user.id, success: false,
        errorReason: String(err), durationMs: Date.now() - startedAt,
      }).catch(() => {});
      return NextResponse.json(
        { error: "Analysis failed. Please try again or contact support." },
        { status: 502 }
      );
    }
  }

  // 3b. Non-streaming path — primary contract
  // Always returns a fully validated TriageResult JSON object
  let result;
  try {
    result = await analyzeCase(noteText, caseId);
  } catch (err) {
    console.error("[analyze route] AI error:", err);
    await writeAuditLog({
      caseId, userId: user.id, success: false,
      errorReason: String(err), durationMs: Date.now() - startedAt,
    }).catch(() => {});
    return NextResponse.json(
      { error: "Analysis failed. Please try again or contact support." },
      { status: 502 }
    );
  }

  // 4. Persist — non-fatal if DB write fails
  try {
    await saveTriageResult(result, user.id);
  } catch (err) {
    console.error("[analyze route] DB persist failed:", err);
  }

  // 5. Audit log — success
  await writeAuditLog({
    caseId, userId: user.id, success: true,
    durationMs: Date.now() - startedAt,
  }).catch(() => {});

  return NextResponse.json(result, { status: 200 });
}
