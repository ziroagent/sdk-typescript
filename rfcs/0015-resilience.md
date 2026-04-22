# RFC 0015: Resilience (fallback chain + record/replay + repair)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **partial** — v0.6 slice landed (`repairToolCall`, model-level record/replay under `@ziro-agent/core/testing`); agent-wide JSONL record/replay and model fallback middleware remain **open**
- Affected packages: `@ziro-agent/middleware`, `@ziro-agent/core`, `@ziro-agent/agent`, `@ziro-agent/tools`, `@ziro-agent/core/testing` (subpath)
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.6) and §A rows K3, L1, B6

## Summary

Make the SDK survive provider outages and flaky completions without operator
intervention. Four primitives (two shipped in narrow form, two still planned):

1. **Model fallback chain.** `wrapModel(primary, fallback([anthropic, openai]))`
   middleware with per-error-class circuit breaker and OTel-traced fallback
   events. **Not shipped** (no dedicated fallback middleware in
   `@ziro-agent/middleware` yet).
2. **Record / replay (agent run).** `recordRun()` / `replayRun(trace)` JSONL of
   model + tool I/O for deterministic CI. **Not shipped** — deferred (G5).
3. **`repairToolCall` hook.** **Shipped** (v0.6): Zod parse failure on tool
   arguments triggers one optional repair via `executeToolCalls` in
   `@ziro-agent/tools`; `createAgent` / `run` / `resume` accept `repairToolCall`
   in `@ziro-agent/agent`.

4. **Model-level testing helpers** (B6): **`createMockLanguageModel`**,
   **`recordLanguageModel`**, **`createReplayLanguageModel`** exported from
   `@ziro-agent/core/testing` — sufficient for unit tests that stub or replay
   `generateText` / stream sequences; not a full agent JSONL trace.

## Scope

- `fallback(providers, options)` middleware. Options: `retryClasses`
  (`'rate_limit' | 'overloaded' | 'timeout'`), `circuitBreakerWindow`,
  `onFallback(event)` callback for tracing. **Planned.**
- `recordRun({ output })` returns a wrapper around `agent.run` that writes a
  JSONL file (or stream) with every model call's request / response and every
  tool call's args / result. **Planned.**
- `replayRun(tracePath)` returns a `MockProvider` and tool stubs that replay
  the recorded responses by sequence; mismatched calls throw a specific
  `ReplayMismatchError`. **Planned.**
- `repairToolCall(call, error, ctx) => repairedCall | null` on
  `createAgent`, `run`, and `resume`; forwarded into `executeToolCalls`. **Shipped.**
- `@ziro-agent/core/testing`: **`createMockLanguageModel`**, **`recordLanguageModel`**,
  **`createReplayLanguageModel`** (+ `ReplayExhaustedError`). **Shipped** (model
  scope only).

## Non-goals

- Speculative execution (K4) — explicit P2.
- Cross-provider semantic equivalence layer — fallback is "use the next
  provider's same prompt"; we don't translate prompts between provider
  conventions.
- A managed "trace store" — record output is a local JSONL by default;
  observability backends (Langfuse, Phoenix) consume the OTel spans, not
  this format.

## Open questions (defer to detailed design)

- Trace format: bespoke JSONL or borrow LangSmith / OTel JSON? Trade-off:
  ergonomics vs. interop. *(Applies to future `recordRun` / `replayRun` only.)*
- Fallback ordering: static (config) or adaptive (latency / error-rate
  weighted)? Default: static, with adaptive as future work.

**Resolved:** `repairToolCall` runs **inside tool execution** when Zod parsing
fails (`@ziro-agent/tools` `executeToolCalls`); the agent forwards the same
callback from `createAgent` / per-`run` / `resume` options so there is a single
consumer-defined repair path for agent-driven tool rounds.

## Detailed design

### 1. `repairToolCall` (shipped)

- **Types:** `RepairToolCall`, `RepairToolCallContext` (re-exported from
  `@ziro-agent/agent` where applicable).
- **Behaviour:** On first parse failure for a tool call, if `repairToolCall` is
  set, it receives the working call, the error, and context including `step`;
  returning a new call triggers **one** re-parse attempt; returning `null`
  preserves the original error path.
- **Tests:** `packages/tools/src/execute-repair.test.ts`.

### 2. `@ziro-agent/core/testing` (shipped, model-only)

- **`createMockLanguageModel`:** returns a `LanguageModel` that serves queued
  responses (text / stream) for tests.
- **`recordLanguageModel`:** wraps a real model and records each generate call
  (`RecordedGenerateCall[]`) for fixture generation.
- **`createReplayLanguageModel`:** reproduces recorded calls in order; throws
  **`ReplayExhaustedError`** when the test consumes more generates than the
  recording contains.

This intentionally does **not** replace a future **`recordRun`**: it does not
capture tool I/O, checkpointer state, or multi-step agent control flow.

### 3. Model fallback middleware (not shipped)

- Entry point remains `fallback(providers, options)` on `@ziro-agent/middleware`
  (exact name TBD to align with existing middleware patterns).
- Must emit OTel events (span attributes or events) on fallback activation and
  on circuit-open transitions; align attribute names with
  `@ziro-agent/tracing` conventions when implemented.

### 4. Agent JSONL record / replay (not shipped)

- **`recordRun`:** wraps `agent.run` (and likely `resume`) to append structured
  lines: model request metadata, assistant/tool message payloads, tool results,
  and optional redaction hooks.
- **`replayRun`:** loads JSONL, returns a configured agent or runner that
  short-circuits provider calls and tool execution according to recorded order;
  **`ReplayMismatchError`** (or equivalent) when sequence or call identity
  diverges.
- Format and versioning to be decided under the open question on trace format.
