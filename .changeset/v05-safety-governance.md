---
"@ziro-agent/core": minor
"@ziro-agent/tools": minor
"@ziro-agent/tracing": minor
"@ziro-agent/agent": minor
---

**v0.5 — Safety & governance (C1, C2, C4)**

- **@ziro-agent/core** — `generateObject()` with Zod validation and optional one-shot repair; `ObjectValidationError`; `BudgetSpec.tenantId` and `hard` (nested scopes coerce soft `onExceed` to `'throw'`); `BudgetContext.tenantId`.
- **@ziro-agent/tools** — `defineTool({ mutates: true })` sets `requiresApproval: true` when `requiresApproval` is omitted; `mutates` stored on the tool.
- **@ziro-agent/tracing** — Budget scope attributes `ziroagent.budget.tenant_id` and `ziroagent.budget.spec.hard`.
- **@ziro-agent/agent** — `serializeBudgetSpec` persists `tenantId` and `hard` on snapshots.

ROADMAP §v0.5 P0 (C1, C2, C4) marked complete.
