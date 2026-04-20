# RFC 0015: Resilience (fallback chain + record/replay + repair)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design TBD before v0.6 milestone start)
- Affected packages: `@ziro-agent/middleware`, `@ziro-agent/core`, `@ziro-agent/core/testing` (subpath)
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.6) and §A rows K3, L1, B6

## Summary

Make the SDK survive provider outages and flaky completions without operator
intervention. Three primitives:

1. **Model fallback chain.** `wrapModel(primary, fallback([anthropic, openai]))`
   middleware with per-error-class circuit breaker and OTel-traced fallback
   events.
2. **Record / replay.** `recordRun()` writes a JSONL trace of model + tool I/O;
   `replayRun(trace)` reuses the recorded responses for deterministic CI
   without LLM calls.
3. **`repairToolCall` hook.** RFC 0004 listed this as a v0.2 adoption row but
   it has not yet shipped. Hook fires when `JSON.parse(call.argumentsRaw)`
   fails; consumer returns a repaired call or `null` to surface the error.

Plus first-class mock provider (`mockModel`, `recordModel`) under
`@ziro-agent/core/testing` (B6 in RFC 0008).

## Scope

- `fallback(providers, options)` middleware. Options: `retryClasses`
  (`'rate_limit' | 'overloaded' | 'timeout'`), `circuitBreakerWindow`,
  `onFallback(event)` callback for tracing.
- `recordRun({ output })` returns a wrapper around `agent.run` that writes a
  JSONL file (or stream) with every model call's request / response and every
  tool call's args / result.
- `replayRun(tracePath)` returns a `MockProvider` and tool stubs that replay
  the recorded responses by sequence; mismatched calls throw a specific
  `ReplayMismatchError`.
- `repairToolCall(call, error, ctx) => repairedCall | null` option on
  `agent.run` and `createAgent`. Default: `null` (surface error, today's
  behaviour).
- `mockModel({ responses })` and `recordModel(realModel, options)` exposed
  from `@ziro-agent/core/testing` subpath.

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
  ergonomics vs. interop.
- Fallback ordering: static (config) or adaptive (latency / error-rate
  weighted)? Default: static, with adaptive as future work.
- `repairToolCall` placement: provider-side (every parse error) or
  agent-side (only when an `agent.run` is in progress)? Likely both, with
  the agent-side variant winning when present.

## Detailed design

TBD before v0.6 milestone start. Owner to draft.
