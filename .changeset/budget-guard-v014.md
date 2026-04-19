---
"@ziro-agent/core": minor
"@ziro-agent/openai": minor
"@ziro-agent/anthropic": minor
"@ziro-agent/agent": patch
"@ziro-agent/tools": patch
"@ziro-agent/memory": patch
"@ziro-agent/tracing": patch
"@ziro-agent/workflow": patch
"@ziro-agent/cli": patch
---

Budget Guard layer 1 (RFC 0001).

`@ziro-agent/core` ships:
- `BudgetSpec`, `BudgetUsage`, `BudgetContext`, `CostEstimate` types.
- `BudgetExceededError` (extends `ZiroError`, branded for cross-realm `isZiroError`).
- `withBudget(spec, fn)` + `getCurrentBudget()` — `AsyncLocalStorage`-backed scope that nested SDK calls inherit and intersect with.
- `generateText({ budget })` and `streamText({ budget })` enforce pre-flight (`estimateCost` + `checkBeforeCall`) and post-call (`recordUsage` + `checkAfterCall`) so the SDK throws **before** any over-budget request is dispatched.
- New subpath `@ziro-agent/core/pricing` with hardcoded OpenAI / Anthropic pricing tables, `getPricing(provider, modelId)`, and `costFromUsage(pricing, usage)` helpers.
- New util `estimateTokensFromMessages(messages)` (chars/4 heuristic) used as the in-core fallback when a provider does not implement `estimateCost`.

`@ziro-agent/openai` and `@ziro-agent/anthropic` implement the optional `LanguageModel.estimateCost(options)` method, returning conservative `{minUsd, maxUsd, minTokens, maxTokens}` bounds backed by `@ziro-agent/core/pricing`. Third-party providers continue to work unchanged — Budget Guard falls back to the SDK's pricing table + heuristic estimator.

`@ziro-agent/agent`, `@ziro-agent/tools`, `@ziro-agent/memory`, `@ziro-agent/tracing`, `@ziro-agent/workflow`, `@ziro-agent/cli` are bumped to consume the new core minor; agent-level `agent.run({ budget, toolBudget })` and tool-level `defineTool({ budget })` integrations land in v0.1.5 / v0.1.6 per the RFC's revised rollout table.
