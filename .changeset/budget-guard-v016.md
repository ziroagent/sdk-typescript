---
"@ziro-agent/core": minor
"@ziro-agent/agent": patch
"@ziro-agent/tools": patch
"@ziro-agent/tracing": patch
"@ziro-agent/openai": patch
"@ziro-agent/anthropic": patch
"@ziro-agent/memory": patch
"@ziro-agent/workflow": patch
"@ziro-agent/cli": patch
---

Budget Guard layer 4 (RFC 0001) — streaming mid-call abort, `onExceed` function form, and pricing-drift CI.

`@ziro-agent/core` adds:
- **Streaming mid-call abort.** `streamText({ budget })` now wraps the provider stream in a budget-aware reader that runs `checkMidStream` on every `text-delta` and aborts the underlying HTTP request via a chained `AbortController` as soon as the projected total (`inputTokens + accumulated completion estimate`) crosses the spec's `maxTokens` / `maxUsd`. Pre-flight + post-call enforcement remain unchanged. Resolves RFC 0001 §Q4.
- **`BudgetSpec.onExceed` function form.** Resolvers receive a `BudgetContext` (spec, observed-so-far, scopeId) and return `{ handled: true, replacement }` to substitute a fallback result, or `{ handled: false }` to re-raise. Wired into `generateText`, `streamText`, and `agent.run` at the layer that **owns** the scope (the layer that passed `budget`); inner SDK calls inheriting a scope propagate `BudgetExceededError` so the owner gets to interpret it. Replacement values must match the calling function's result type — type-parameterized `BudgetResolution<T>` is on the v0.2 roadmap.
- New `checkMidStream(scope, projectedTokens, projectedUsd)` enforcement primitive (re-exported via `budget/index.js` for users writing custom streaming wrappers).
- New `applyResolution(scope, error)` and `resolveOnExceed(scope, error)` helpers for layers that need to plug into the function-form resolver.
- Aggregate promises returned by `streamText` (`text()`, `finishReason()`, `usage()`, `toolCalls()`) now reject — rather than hang — when the underlying stream errors. Each promise also pre-attaches a noop `.catch` so an early rejection doesn't surface as an unhandled rejection on Node.
- `getCurrentScope` re-exported from the package root.

`@ziro-agent/agent` adds:
- `agent.run({ budget: { onExceed: fn } })` invokes the resolver when the agent loop's `withBudget` throws and returns the resolver's `replacement` (typed as `AgentRunResult`) directly. Resolver-thrown errors are surfaced with the original `BudgetExceededError` attached as `cause`. `truncate` semantics (v0.1.5) are unchanged.

`@ziro-agent/tools`, `@ziro-agent/tracing`: no API changes; recompiled against the new core.

Infra:
- New `scripts/check-pricing-drift.ts` parses `packages/core/src/pricing/data.ts` and warns when any entry's `validFrom` is older than `STALENESS_DAYS` (default 60). Default is warn-only — drift is a reminder, not a blocker.
- New `.github/workflows/pricing-drift.yml` runs the script weekly (Mondays 09:00 UTC) and on PRs that touch the pricing table. Scheduled drift opens / refreshes a `pricing-drift` tracking issue; PR runs surface a workflow annotation. `workflow_dispatch` accepts a `staleness_days` override.

RFC 0001 status updated to **accepted (v0.1.6)** — Q4 resolved, adoption table flipped to "shipped" for the streaming layer and the function-form resolver.
