# RFC 0017: Resumable `streamText` — replay *then* continue upstream

- Start date: 2026-04-25
- Authors: @ziro-agent/maintainers
- Status: **draft** — design comments open per `GOVERNANCE.md`
- Parent: [RFC 0006 — `Checkpointer` + resumable streams](./0006-checkpointer.md) §resumable streams
- Affected packages: `@ziro-agent/core` (`streamText`, `ResumableStreamEventStore`), `@ziro-agent/checkpoint-redis` (Redis store), docs / cookbooks

## Summary

Today, `streamText({ resumable: true, streamEventStore })` records `ModelStreamPart` events by sequential index, and `streamText({ resumeKey, resumeFromIndex, streamEventStore })` **replays** slices from the store only. It does **not** open a new call to the language model to append further events after the last persisted index.

This RFC specifies the **“replay then continue upstream”** behavior promised at a high level in RFC 0006: after emitting all parts with index `>= resumeFromIndex` that are already in the store, the SDK should **optionally** attach a live model stream and keep appending new parts (with increasing indices) **when the original run did not complete** (e.g. client disconnect, process crash) and the operator opts in to continuation.

MVP (shipped) remains **replay-only**; this document is the plan for the next slice.

## Motivation

- **User expectation:** Competitors (e.g. Mastra-style resumable streams) describe resuming as “catch up from cache, then keep generating.” Replay-only is correct for *completed* streams and for *debugging* / CLI *tail*, but the common “tab closed mid-stream” case needs a **second** leg from the model once cached bytes are delivered.
- **Single abstraction:** The same `resumeKey` and `ResumableStreamEventStore` should back both **cold replay** and **continue**, so HTTP handlers do not need two different storage systems.
- **Clear boundary:** Defining “continue” as a separate explicit mode avoids surprising billing and duplicate side effects when users only wanted idempotent replay.

## Definitions

- **Event log:** Ordered list of `ModelStreamPart` entries for a `resumeKey`, with indices `0..N-1` in append order.
- **Terminal part:** A stream part that ends the model turn for this call (e.g. `type: 'finish'`, or `error` / provider-specific end). Exact mapping is implementation-defined in `@ziro-agent/core` but must be stable and documented.
- **Completed log:** A log where the last appended part (before close) is **terminal** — the model run for that `resumeKey` has finished; no more parts will be produced for that run without a *new* `streamText` invocation with a *new* key.
- **Incomplete log:** A log that ended without a terminal part (abort, crash, cap error mid-stream, etc.).

## Goals

1. **Correctness:** A client that reconnects with `resumeFromIndex = K` should never see duplicate or out-of-order parts relative to a single serial observer of the combined stream.
2. **Explicit continuation:** Callers must opt into upstream continuation (e.g. `continueUpstream: true` or a dedicated overload) so that **replay-only** remains the default, cheap path.
3. **Reuse stored prefix:** The implementation should emit parts `K..M-1` from the store (where `M` is the current store length) before any live leg, without re-calling the model for that prefix.
4. **Idempotency awareness:** Document that continuing upstream **issues a new model request** (or provider continuation primitive where available) and may incur **additional** usage; cache/retry policies belong in middleware or the host, not hidden inside `streamText` defaults.

## Non-goals (v1 of this RFC)

- **Arbitrary out-of-order append** across multiple writers — see “Concurrency” (single-writer or explicit conflict error).
- **Provider-native “resume this response id”** as a *required* part of the API: where OpenAI/Anthropic expose continuation IDs, adapters may use them, but the Ziro contract stays **message + same logical request**-based.
- **Cross-region deserialization** of in-flight provider state: we only require **our** `ModelStreamPart` log + a **new** `Model` call (or provider continuation) to extend the log.

## Detailed design

### 1. Session metadata: completed vs incomplete

`ResumableStreamEventStore` (or a parallel optional API) should expose **whether** a `resumeKey` is **completed** (terminal part present).

Sketch:

```ts
export interface ResumableStreamSessionMeta {
  /** Monotonic; next append index. */
  nextIndex: number;
  /** True once a terminal part has been stored for this key. */
  completed: boolean;
  /** Optional: last time any part was written (for TTL UX). */
  updatedAt?: number;
}

// Optional on the store interface (or a small extension interface):
// getSessionMeta(resumeKey: string): Promise<ResumableStreamSessionMeta | null>
```

- On **normal** stream end, the `tap` path records the **terminal** part and flips `completed`.
- On **error / abort** before terminal, `completed` remains false (subject to “best effort”: some providers may not emit a terminal part; document behavior).

`getParts(resumeKey, fromIndex)` behavior stays as today; **completing** a session is orthogonal to read paths.

### 2. `streamText` options for continue-upstream

Extend the **replay** branch (options that include `resumeKey` + `streamEventStore`) with an optional flag and the **same** model / prompt fields needed for a fresh `model.stream` when continuation is allowed:

```ts
type StreamTextOptionsContinue = StreamTextOptionsFromReplay & {
  /** When true, after replaying stored parts from `resumeFromIndex`, open upstream if the session is not completed. */
  continueUpstream?: boolean;
} & (
  | { continueUpstream?: false | undefined } // no extra fields
  | { continueUpstream: true; model: LanguageModel; /* + messages, tools, ... same as “from model” branch */ }
);
```

Exact typing should mirror the existing `StreamTextOptionsFromModel` model-call fields to avoid drift (a shared `ModelStreamTextRequest` type is preferable to duplicating 15 optionals).

**Behavior:**

1. Load metadata + `getParts(resumeKey, resumeFromIndex ?? 0)`.
2. Return a `ReadableStream` that:
   - **First** enqueues all replay parts from the store (same as today).
   - **If** `continueUpstream === true` **and** `meta.completed === false` **and** (optional) the caller provided `model` + messages: open `model.stream(...)` and **append** each emitted part to the store with indices `meta.nextIndex`, `meta.nextIndex+1`, …; pipe through to the consumer.
   - **If** `continueUpstream === true` **and** `meta.completed === true`: **no** upstream leg — the stream is replay-only (document as “idempotent no-op for upstream” or log a one-line debug message in dev only).
3. If `continueUpstream` is true but **required** model fields are missing, throw a clear `TypeError` at call time (same class of error as missing `streamEventStore` in replay mode).

**Budget / abort:** The continued leg should participate in the same `Budget` / `AbortSignal` semantics as a normal `streamText` call. Pre-flight for the *continuation* may need to re-estimate tokens; mid-stream rules apply to the *live* leg only (replay is already “paid” in historical terms; document that replay does not re-run pre-flight for past parts).

### 3. Concurrency and multiple resumers

- **In-memory + Redis stores** should document **single-writer** for a given `resumeKey` while `completed === false` (MVP: last writer wins or `append` throws if index mismatch — already partially enforced by ordered `append`).
- **Continue upstream** from two nodes simultaneously: avoid undefined logs — prefer:
  - **Optimistic:** first `model.stream` wins; second gets `ResumableStreamError` or a dedicated `ResumeConflictError` on `append` when `nextIndex` moved; **or**
  - **Advisory lock** in Redis (out of scope for core; document extension point in `RedisResumableStreamEventStore`).

### 4. Provider-specific continuation (optional)

If a `LanguageModel` / provider can resume without resending the full message list, that optimization belongs in the **model adapter** behind the same `model.stream` call, driven by `providerOptions` or internal state. This RFC only requires: **Ziro stores parts; Ziro can issue one more `stream` and append** — not that every provider is token-efficient on resume.

## Drawbacks

- **Double billing confusion:** Users may not realize replay is cheap but continuation is a new model call. Mitigation: naming (`continueUpstream`), docs, and optional tracing span `ziro.stream_text.continue_upstream`.
- **Incomplete detection false negatives:** If a provider never sends `finish` on crash, the log may look “incomplete” forever and `continueUpstream` may duplicate content unless the app passes `aborted: true` or a manual `markCompleted(resumeKey)` — consider a later escape hatch.
- **Store growth:** Continuation extends the same log; caps (`maxEvents`, `maxBytes`, TTL) apply as today.

## Alternatives

- **Server-Sent only:** Require clients to always open a *new* `streamText` with full messages and `resumeFromIndex: 0` on the *client* by merging text — rejected: duplicate model work and diverges from server-authoritative log.
- **Mandate provider continuation IDs** — rejected as primary path; optional adapter enhancement only.

## Adoption strategy

- Non-breaking: default remains **replay-only**; new options are additive.
- Cookbook: add a “Tab disconnect — replay then continue” section after implementation ships.
- Session meta (`getSessionMeta`, `completed` on `finish` / `error`, `append` guard after complete) is implemented on both stores. Legacy Redis keys without `comp` / `ts` still work: `completed` is false until a new terminal part is written.

## Phased delivery (plan)

| Phase | Deliverable | Notes |
| ----- |-------------|-------|
| A | `getSessionMeta` (or equivalent) + `completed` flips on terminal part | **Shipped** in `InMemoryResumableStreamEventStore` + `RedisResumableStreamEventStore` (`@ziro-agent/core`, `@ziro-agent/checkpoint-redis`); no new `streamText` surface yet |
| B | `streamText` replay stream concatenated with `model.stream` when `continueUpstream: true` | **Shipped** in `@ziro-agent/core`; replays cached tail then appends live parts into the same session log. |
| C | Optional Redis `SETNX` / lock helper for single-writer continue | Optional package API in `checkpoint-redis` |
| D | Replay/continue observability hooks | **Shipped** via `setResumableStreamObserver` + phase events (`replay_*`, `continue_upstream_*`, lock acquire/release). Tracing packages can map these to spans. |

## Unresolved questions

- Should `continueUpstream` require an explicit `expectedNextIndex` from the client to detect stale tabs?
- How to represent **tool-call** mid-stream: if the log ends mid-tool-call, is continuation allowed, or do we require resuming the **agent** loop (RFC 0002) instead of raw `streamText`?
- Should **budget** be charged for replay bytes as 0 tokens, or a configurable “replay free” mode only when `!continueUpstream`?
