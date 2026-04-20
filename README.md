# Case Triage Assistant

An AI-powered triage feature for admin users built with Next.js (App Router), TypeScript, and Anthropic Claude. Given a case note, it generates a summary, assigns a priority level, suggests structured tags, and returns a confidence score.

---

## Setup

### 1. Install dependencies

```bash
npm install zod
```

### 2. Environment variable

Add your Anthropic API key to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Database migrations

The SQL for both tables lives as comments at the top of their respective repository files. Copy each `CREATE TABLE` block into your migration tool.

- `src/lib/db/triageRepository.ts` → creates `case_triage_results`
- `src/lib/db/auditRepository.ts` → creates `triage_audit_log`

### 4. Auth session shape

The route expects your NextAuth session to expose `user.role` and `user.permissions` (string[]). It checks for:

- `role === "admin"`
- `permissions.includes("triage:write")`

Adjust `src/lib/auth/permissions.ts` if your session shape differs.

---

## Running the tests

```bash
npx vitest run src/lib/ai/triageService.test.ts
```

No database or API key required — tests run against the Zod schema directly. All 30 cases should pass.

---

## Usage

Import the panel component into any admin page:

```tsx
import { CaseTriagePanel } from "@/components/admin/CaseTriagePanel";

<CaseTriagePanel
  caseId={case.id}
  noteText={case.noteText}
/>
```

The component manages loading, streaming, error, and success states internally.

---

## API Endpoint

```
POST /api/admin/case-triage/:caseId/analyze
```

**Request body:**

```json
{
  "noteText": "Patient presented with...",
  "stream": true
}
```

Set `stream: false` or omit it for a standard JSON response.

**Response (non-streaming, 200):**

```json
{
  "summary": "Patient requires urgent follow-up for elevated blood pressure.",
  "priority": "High",
  "tags": ["urgent_follow_up", "blood_pressure", "medication_review"],
  "confidence": 87,
  "modelUsed": "claude-sonnet-4-20250514",
  "promptVersion": "triage-v1.1",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**Error responses:**

| Status | Meaning |
|--------|---------|
| 400 | Missing or invalid request body |
| 401 | Not authenticated |
| 403 | Not admin, or missing triage:write permission |
| 502 | AI service failed or returned invalid output |

---

## Architecture

```
CaseTriagePanel.tsx        → UI: triggers analysis, renders all states
route.ts                   → Orchestration: auth → input → AI → DB → response
triageService.ts           → AI: Anthropic call, Zod validation, retry logic
triageRepository.ts        → Persistence: successful results
auditRepository.ts         → Persistence: every attempt including failures
permissions.ts             → Auth: admin role + permission check
types/triage.ts            → Shared TypeScript types
```

---

## Assumptions

- Next.js App Router with TypeScript
- Database client exported from `@/lib/db/client`
- NextAuth with `user.role` and `user.permissions[]` on the session

---

## What was intentionally left out

- **Per-user rate limiting** — would use Redis middleware in production
- **Integration tests** — unit tests cover the validator; route-level tests are the next target
- **Progressive streaming** — the client currently streams raw JSON tokens; a JSON streaming parser would render each field as it completes
- **Toast notifications** — errors are shown inline; a toast system would be less disruptive in a multi-panel admin UI
