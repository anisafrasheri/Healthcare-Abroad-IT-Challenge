# File Structure

```
Healthcare-Abroad-IT-Challenge/
│
├── src/
│   │
│   ├── types/
│   │   └── triage.ts
│   │       Shared TypeScript types: TriageResult, Priority, RawAITriageOutput.
│   │       Single source of truth — all other files import from here.
│   │
│   ├── lib/
│   │   │
│   │   ├── auth/
│   │   │   └── permissions.ts
│   │   │       Exports requireAdminPermission() and AuthError.
│   │   │       Checks admin role + specific permission (triage:write).
│   │   │       Isolated so any future route can reuse it.
│   │   │
│   │   ├── ai/
│   │   │   ├── triageService.ts
│   │   │   │   AI layer: Anthropic call, system prompt, Zod validation,
│   │   │   │   retry logic, streaming. Exports analyzeCase() and
│   │   │   │   analyzeCaseStream(). Nothing else lives here.
│   │   │   │
│   │   │   └── triageService.test.ts
│   │   │       Vitest unit tests for the Zod schema.
│   │   │       30 cases, no DB or API key needed to run.
│   │   │
│   │   └── db/
│   │       ├── client.ts                 ← already exists in your project
│   │       │   Your existing database client (Kysely, Drizzle, pg, etc.)
│   │       │
│   │       ├── triageRepository.ts
│   │       │   saveTriageResult() and getLatestTriageResult().
│   │       │   SQL schema for case_triage_results in file comments.
│   │       │
│   │       └── auditRepository.ts
│   │           writeAuditLog() and getAuditLogsForCase().
│   │           SQL schema for triage_audit_log in file comments.
│   │           Records every attempt including failures.
│   │
│   ├── app/
│   │   └── api/
│   │       └── admin/
│   │           └── case-triage/
│   │               └── [id]/
│   │                   └── analyze/
│   │                       └── route.ts
│   │                           POST handler. Wires auth → input validation
│   │                           → AI service → persistence → audit log.
│   │                           Supports streaming and non-streaming modes.
│   │
│   └── components/
│       └── admin/
│           └── CaseTriagePanel.tsx
│               React client component. Trigger button + idle / streaming /
│               success / error states. Import into any admin page.
│
├── .env.local                            ← already exists, add key here
│   ANTHROPIC_API_KEY=sk-ant-...
│
└── README.md
    Setup, usage, API contract, architecture overview.
```

---

## Dependency map

Who imports from whom:

```
CaseTriagePanel.tsx
  └── (fetch) → route.ts

route.ts
  ├── permissions.ts
  ├── triageService.ts
  ├── triageRepository.ts
  └── auditRepository.ts

triageService.ts
  └── types/triage.ts

triageRepository.ts
  └── types/triage.ts

auditRepository.ts
  └── (no shared types needed)

triageService.test.ts
  └── triageService.ts  (TriageOutputSchema only)
```
