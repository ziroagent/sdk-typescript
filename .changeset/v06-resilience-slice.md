---
"@ziro-agent/core": minor
"@ziro-agent/tools": minor
"@ziro-agent/agent": minor
---

**v0.6 resilience slice (K3 + L1 + repairToolCall)**

- **@ziro-agent/core** — `withFallbackChain([primary, ...])` for `generate`/`stream`; optional `shouldFallback`; export from package root.
- **@ziro-agent/core/testing** — `createReplayLanguageModel` + `ReplayExhaustedError` for deterministic tests.
- **@ziro-agent/tools** — `executeToolCalls({ repairToolCall, step })` with one repair retry after Zod parse failure; exported `RepairToolCall` / `RepairToolCallContext`.
- **@ziro-agent/agent** — `repairToolCall` on `createAgent`, `run`, and `resume`; re-export repair types from package root.

ROADMAP §v0.6: K3, L1 slice, and `repairToolCall` track marked complete; G5 / full JSONL record-replay deferred.
