---
'@ziro-agent/core': minor
'@ziro-agent/agent': minor
'@ziro-agent/tracing': minor
---

Expose `BudgetContext.remaining.steps` when `maxSteps` is set (aligned with `toContext`), mirror it in the agent `onExceed` snapshot helper, and emit used/remaining budget fields on budget scope spans (including `BudgetUsedSteps` and `BudgetRemaining*` attributes).
