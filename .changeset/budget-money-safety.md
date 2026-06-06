---
'@ziro-agent/core': minor
'@ziro-agent/tools': minor
'@ziro-agent/agent': patch
---

Budget Guard money-safety hardening (RFC 0001):

- **Nested write-back (C2):** spend made inside a budgeted tool (or any nested `withBudget`) now counts against the outer cap. Previously a child scope was seeded from a parent snapshot and never wrote back, so LLM calls made inside a tool were invisible to the agent's `maxUsd`/`maxTokens`. When a parallel tool trips the budget it now also signals its siblings to abort.
- **Unenforceable `maxUsd` is no longer silent (C1):** when `maxUsd` is set but the SDK has no pricing for the model (e.g. local Ollama/vLLM), USD resolved to `$0` and the cap was a silent no-op. It now warns once per model, or throws `InvalidArgumentError` under a `hard` budget.
- **Hard budgets cap output (C3):** a `hard` budget with `maxUsd` and no caller `maxTokens` now derives an output-token ceiling from the remaining USD, so a single output-heavy call can no longer overshoot the cap before the post-call check.
- **Realm-safe budget detection:** new `isBudgetExceededError()` (plus `isAPICallError` / `isTimeoutError`); the money-safety control flow no longer relies on `instanceof`, so a budget error crossing a realm/bundle boundary cannot silently degrade into a generic error and let a run keep spending.
