---
"@ziro-agent/agent": minor
"@ziro-agent/tools": minor
"@ziro-agent/tracing": minor
"@ziro-agent/core": patch
"@ziro-agent/openai": patch
"@ziro-agent/anthropic": patch
"@ziro-agent/memory": patch
"@ziro-agent/workflow": patch
"@ziro-agent/cli": patch
---

Budget Guard layers 2+3 (RFC 0001) — agent loop, per-tool declared budgets, OpenTelemetry observability.

`@ziro-agent/agent` adds:
- `agent.run({ budget, toolBudget })` — wraps the loop in `withBudget(budget, ...)` so every nested `generateText` and `executeToolCalls` participates in the same `AsyncLocalStorage` scope. `toolBudget` is intersected per tool call.
- `BudgetSpec.maxSteps` is honored at the agent layer (intentionally ignored at the `generateText` layer); when both `CreateAgentOptions.maxSteps` and `BudgetSpec.maxSteps` are set, the tighter wins.
- `BudgetSpec.onExceed: 'truncate'` returns an `AgentRunResult` with `finishReason: 'budgetExceeded'` and a populated `budgetExceeded` field instead of throwing. Default remains `'throw'` (back-compat).
- New step event `{ type: 'budget-exceeded', info }` emitted just before `agent-finish` in `truncate` mode; new `AgentBudgetExceededInfo` and `AgentFinishReason` types exported.

`@ziro-agent/tools` adds:
- `defineTool({ budget })` — per-invocation budget that is intersected with the surrounding agent budget and any batch-level `toolBudget`.
- `executeToolCalls({ toolBudget })` — apply a default budget to every tool call in a batch.
- `ToolExecutionResult.budgetExceeded` — a `BudgetExceededError` thrown inside a tool is captured here (with `isError: true`) instead of crashing the agent loop. The agent then promotes the first such result back into a budget halt with `origin: 'tool'`.
- Re-exports `getCurrentBudget` from `@ziro-agent/core` so tool authors get one import.

`@ziro-agent/tracing` adds:
- `instrumentBudget()` — registers a `BudgetObserver` that opens a `ziro.budget.scope` span per `withBudget` call and attaches `usage.update`, `warning`, and `exceeded` events. Returns `{ unregister, previous }` for clean teardown / chaining.
- New `ATTR.Budget*` attribute keys (`ziroagent.budget.spec.*`, `ziroagent.budget.used.*`, `ziroagent.budget.exceeded.*`, `ziroagent.budget.warning.*`, `ziroagent.budget.scope.*`).

`@ziro-agent/core` (additive patch):
- New internal-stable hook: `setBudgetObserver()` + `BudgetObserver` interface (subscribers see `onScopeStart`, `onScopeEnd`, `onUsageUpdate`, `onWarning`, `onExceeded`). Observer exceptions are swallowed so instrumentation bugs cannot break user code.
- `intersectSpecs` re-exported from the package root for the tools layer to compose `tool.budget` ∩ `toolBudget`.
- `process.emitWarning` is preserved as the back-compat warning channel — tracing now fires in addition, not instead.

`@ziro-agent/openai`, `@ziro-agent/anthropic`, `@ziro-agent/memory`, `@ziro-agent/workflow`, `@ziro-agent/cli` are bumped to consume the new core patch.
