# RFC 0015: Resilience (fallback chain + record/replay + repair)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **partial** — v0.6+ slice: `repairToolCall`, `@ziro-agent/core/testing` model helpers, **`modelFallback`** middleware (optional circuit breaker), **agent JSONL record/replay** (`runWithAgentRecording` / `recordAgentRun`), **`createModelFallbackOtelOnFallback`** in `@ziro-agent/tracing`; full declarative `replayRun(tracePath)` wrapper and adaptive routing remain **open**
- Affected packages: `@ziro-agent/middleware`, `@ziro-agent/core`, `@ziro-agent/agent`, `@ziro-agent/tools`, `@ziro-agent/core/testing`, `@ziro-agent/tracing`
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.6) and §A rows K3, L1, B6

## Summary

Make the SDK survive provider outages and flaky completions without operator
intervention. Primitives:

1. **Model fallback chain.** **`modelFallback({ fallbacks, shouldFallback?, onFallback?, circuitBreaker? })`** as `LanguageModelMiddleware` with **`wrapModel`**; optional **`withFallbackChain`** on `@ziro-agent/core` for a composed `LanguageModel` without middleware ordering. **`createModelFallbackOtelOnFallback()`** supplies `onFallback` for short **`ziro.model.fallback`** spans + ATTR keys.
2. **Record / replay (agent run).** **`runWithAgentRecording` / `recordAgentRun`** append one JSON line per **`step-finish`**; **`parseAgentRecordingJsonl`**, **`createReplayModelFromAgentRecording`**, **`createReplayToolsFromAgentRecording`**, **`ReplayMismatchError`** — deterministic CI without live LLM/tools when paired with `createAgent`.
3. **`repairToolCall` hook.** **Shipped** (v0.6): Zod parse failure on tool arguments triggers one optional repair via `executeToolCalls` in `@ziro-agent/tools`; `createAgent` / `run` / `resume` accept `repairToolCall` in `@ziro-agent/agent`.

4. **Model-level testing helpers** (B6): **`createMockLanguageModel`**, **`recordLanguageModel`**, **`createReplayLanguageModel`** from `@ziro-agent/core/testing` — model-only; orthogonal to agent JSONL.

## Scope

- **`modelFallback`** + **`resetModelFallbackCircuitState`** — shipped in `@ziro-agent/middleware`.
- **Agent recording** — shipped in `@ziro-agent/agent` (see Detailed design §4).
- **`replayRun(tracePath)`** as a single entry that returns a runnable without manual `createAgent` wiring — **planned** (convenience only).
- **`repairToolCall`** — shipped (see §1).
- **`@ziro-agent/core/testing`** — shipped (model scope only).

## Non-goals

- Speculative execution (K4) — explicit P2.
- Cross-provider semantic equivalence layer — fallback is "use the next
  provider's same prompt"; we don't translate prompts between provider
  conventions.
- A managed "trace store" — record output is caller-controlled JSONL by default;
  observability backends consume OTel spans, not this format exclusively.

## Open questions (defer to detailed design)

- Trace format: bespoke JSONL or borrow LangSmith / OTel JSON? Trade-off:
  ergonomics vs. interop. *(Applies to future richer `recordRun` / versioning.)*
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

This does **not** capture per-step tool I/O the way agent recording does.

### 3. Model fallback (shipped)

- **Middleware:** `modelFallback({ fallbacks, shouldFallback?, onFallback?, circuitBreaker?: { failureThreshold, resetMs } })` in `@ziro-agent/middleware`; compose with **`wrapModel(primary, [modelFallback(...), retry(), ...])`**.
- **Core alternative:** `withFallbackChain([m1, m2, ...], { shouldFallback? })` — single `LanguageModel` without middleware onion.
- **Circuit breaker:** consecutive recoverable primary failures increment toward `failureThreshold`; until `resetMs` elapses, primary `doGenerate` / `doStream` is skipped and fallbacks run first; success on fallback when circuit was open clears state; primary success always clears.
- **OTel:** `createModelFallbackOtelOnFallback()` → `{ onFallback }` pass-through to `modelFallback`; span `ziro.model.fallback`, attrs `ziroagent.model.fallback.*` (`ATTR` in `@ziro-agent/tracing`).

### 4. Agent JSONL record / replay (shipped, composable)

- **`runWithAgentRecording(agent, { ...runOptions, recording: { writeLine } })`:** chains `onEvent`; on `step-finish`, writes one JSON object per line (`v: 1`, `kind: 'step'`, serialized step).
- **`parseAgentRecordingJsonl`**, **`createReplayModelFromAgentRecording`**, **`createReplayToolsFromAgentRecording`**, **`ReplayMismatchError`**, **`recordAgentRun`** alias — exported from `@ziro-agent/agent`.
- **Replay contract:** tool results keyed by **`toolCallId`**; `isError` paths replay by throwing from stub tools to match `executeToolCalls` capture behaviour. HITL / `pendingApproval` traces are not a target for this MVP.
- **Future:** higher-level `replayRun(tracePath)` that returns `{ agent, run }` pre-wired — optional sugar.
