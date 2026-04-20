---
'@ziro-agent/core': minor
'@ziro-agent/tools': minor
'@ziro-agent/agent': minor
'@ziro-agent/tracing': minor
'@ziro-agent/openai': patch
'@ziro-agent/anthropic': patch
'@ziro-agent/memory': patch
'@ziro-agent/workflow': patch
'@ziro-agent/cli': patch
---

**Human-in-the-Loop (RFC 0002, v0.1.7)** — production-safety primitive #2
paired with Budget Guard.

Tools can now declare `requiresApproval` (boolean or
`(input, ctx) => boolean | Promise<boolean>`). When a guarded tool fires,
`agent.run({ approver })` either resolves the approval inline through the
caller-supplied callback or suspends the run by serializing the full
agent state to a JSON-shaped `AgentSnapshot` and throwing
`AgentSuspendedError`. Persist the snapshot to any KV store; later call
`agent.resume(snapshot, { decisions })` to continue — message history,
pending sibling tool calls, and budget usage carry forward.

Highlights:

- **`@ziro-agent/core`** — new `Approver` / `ApprovalRequest` /
  `ApprovalDecision` types; `ApprovalObserver` hook (mirrors
  `BudgetObserver`); `withBudget({ presetUsage })` for budget continuity
  across multi-day suspensions.
- **`@ziro-agent/tools`** — `defineTool({ requiresApproval })`; per-call
  approval gate inside `executeToolCalls`; new `pendingApproval` variant
  on `ToolExecutionResult`.
- **`@ziro-agent/agent`** — `AgentSnapshot`, `AgentSuspendedError`,
  `isAgentSuspendedError`, `agent.run({ approver, agentId })`,
  `agent.resume(snapshot, opts)`. Internal `iterateLoop` refactor shares
  state machine between fresh runs and resumed runs.
- **`@ziro-agent/tracing`** — `instrumentApproval()` emits
  `ziro.approval.*` and `ziro.agent.suspended/resumed` spans + events.

Bug fix (also in `@ziro-agent/core`): `getCurrentBudget()` /
`getCurrentScope()` now propagate correctly under pure-ESM Node runtimes
(e.g. `tsx`, `node --import`). The previous lazy `require('node:async_hooks')`
silently fell back to `null` in ESM, which broke implicit budget-scope
propagation across `await` boundaries inside the agent loop.

See `rfcs/0002-human-in-the-loop.md` and `examples/agent-with-approval/`.
