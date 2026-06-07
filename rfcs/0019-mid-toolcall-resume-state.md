# RFC 0019: Mid-tool-call resumable state object

- Start date: 2026-06-07
- Authors: @ziro-agent/maintainers
- Status: **accepted** (2026-06-07) — cleared for implementation
- Affected packages: `@ziro-agent/core`, `@ziro-agent/agent`
- Parent: [RFC 0018 — Phase F mid-tool-call agent resume](./0018-phase-f-mid-toolcall-agent-resume.md)
- Related: [RFC 0017 — Resumable streamText](./0017-resumable-stream-continue-upstream.md), [RFC 0002 — Human-in-the-loop](./0002-human-in-the-loop.md)
- Source: community feedback on [ziroagent/sdk-typescript#108](https://github.com/ziroagent/sdk-typescript/issues/108) (@norika1207-lab)

## Summary

When a resumable stream ends mid-tool-call, the host-facing path currently only
**throws** `ContinueUpstreamMidToolCallError` (a bare message + code). This RFC
adds a structured, serializable **resumable state object** describing what the
stream stopped on and what recovery action is safe — attached to that error and
buildable directly from a persisted log. The state object is surfaced from
**`@ziro-agent/agent`** so application developers branch on an explicit recovery
decision instead of treating every mid-tool-call interruption as the same path.

## Motivation

Today, after `streamText({ continueUpstream: true })` blocks, the host knows
*that* it cannot continue but not *why* or *what to do*. To make a safe decision
it must independently call `store.getParts(...)`, re-run `tailBlocksContinueUpstream`,
and hand-inspect `ModelStreamPart`s to recover the partial tool-call. There is no
single object that answers the operator's real questions:

- Which stream / checkpoint is this? (`resumeKey`, optional `checkpointId`)
- What tool-call was being formed? (`id`, `name`, argument buffer)
- Are the buffered tool arguments syntactically complete JSON?
- How far did the log get? (event offset)
- **Has any side effect already started?** — the decisive boundary.
- What is the recommended recovery: resume upstream, restart the model turn,
  execute pending tools, or require human review?

The **side-effect boundary** is the core insight from #108: if the stream ended
while *forming* tool arguments, replay/continuation is safe; if tool *execution*
may already have begun, recovery needs idempotency or an operator checkpoint.
Hosts must be able to see this distinction at the `@ziro-agent/agent` layer
rather than inferring it.

Most of the underlying data already exists — it is simply not gathered into one
object. `ResumableStreamSessionMeta.nextIndex` is the event offset; the partial
tool-call lives in the persisted `tool-call` / `tool-call-delta` parts; the
decision logic already lives in `tailBlocksContinueUpstream`.

## Detailed design

### New type (`@ziro-agent/core`, re-exported from `@ziro-agent/agent`)

```ts
/** Why a mid-tool-call log cannot blindly `continueUpstream`, and what to do. */
export type MidToolCallRecommendedAction =
  | 'resume-upstream'       // tail is safe text/tool streaming; continueUpstream OK
  | 'restart-model-turn'    // partial/garbled tool args; re-issue the model turn
  | 'execute-pending-tools' // complete tool-call(s) present, not yet executed
  | 'human-review';         // side effect may have started; needs operator decision

export interface MidToolCallPartialToolCall {
  /** Provider tool-call id, when present in the buffered parts. */
  id?: string;
  /** Tool name, when present. */
  name?: string;
  /** Stable hash of the buffered argument text (sha-256 hex), for dedup/compare. */
  argsBufferHash?: string;
  /** True when the buffered argument text parses as complete JSON. */
  inputComplete: boolean;
}

export interface MidToolCallResumeState {
  /** Resumable stream id (RFC 0017). */
  resumeKey: string;
  /** Agent checkpoint id, when recovery is happening through a checkpointer. */
  checkpointId?: string;
  /** The tool-call the log stopped on, if any. */
  partialToolCall?: MidToolCallPartialToolCall;
  /** Index of the next append == count of stored parts (ResumableStreamSessionMeta.nextIndex). */
  lastEventOffset: number;
  /**
   * Whether tool execution may already have started. For pure stream-recovery
   * (log ended at/inside a tool boundary, before the agent executed anything)
   * this is provably `false`. The agent loop can set it `true` once it knows a
   * tool's `execute()` has been entered (see "Side-effect tracking" below).
   */
  sideEffectStarted: boolean;
  /** Recommended recovery path. */
  recommendedAction: MidToolCallRecommendedAction;
}
```

### Builder (`@ziro-agent/core`)

```ts
export function describeMidToolCallResume(
  resumeKey: string,
  parts: readonly ModelStreamPart[],
  meta: Pick<ResumableStreamSessionMeta, 'nextIndex'>,
  opts?: { checkpointId?: string; sideEffectStarted?: boolean },
): MidToolCallResumeState;
```

It reuses the existing tail scan from `tailBlocksContinueUpstream`:

- Finds the last non-`error` part.
- If it is `tool-call` / `tool-call-delta`, extracts `id` / `name`, concatenates
  the buffered argument text, computes `argsBufferHash` (reusing
  `auditDigestHex` from `@ziro-agent/audit`'s primitive, or an inlined sha-256),
  and sets `inputComplete` by attempting `JSON.parse`.
- Maps to `recommendedAction`:
  - `tool-call-delta` or incomplete JSON → `restart-model-turn`
  - complete `tool-call` not followed by results → `execute-pending-tools`
  - `finish` with `finishReason: 'tool-calls'` → `execute-pending-tools`
  - any case with `sideEffectStarted: true` → **overridden to** `human-review`
  - otherwise → `resume-upstream`

### Error enrichment (`@ziro-agent/core`)

`ContinueUpstreamMidToolCallError` gains an optional `details`:

```ts
export class ContinueUpstreamMidToolCallError extends ResumableStreamError {
  readonly details?: MidToolCallResumeState;
  constructor(message?: string, details?: MidToolCallResumeState) { /* ... */ }
}
```

`streamText` already has `resumeKey`, the replayed `parts`, and session meta at
the throw site ([stream-text.ts](../packages/core/src/stream-text.ts)), so it
populates `details` via `describeMidToolCallResume(...)`. **This is additive:**
the error type, name, code, and message are unchanged; existing
`isContinueUpstreamMidToolCallError` / try-catch callers keep working.

### Agent-level surface (`@ziro-agent/agent`)

Re-export `MidToolCallResumeState`, `MidToolCallRecommendedAction`, and
`describeMidToolCallResume` alongside the existing
`streamTailNeedsAgentRecovery` / `MID_TOOL_CALL_CONTINUE_UPSTREAM_HINT`. Add a
convenience for hosts that hold a store rather than an error:

```ts
export async function inspectMidToolCallResume(
  store: ResumableStreamEventStore,
  resumeKey: string,
  opts?: { checkpointId?: string; sideEffectStarted?: boolean },
): Promise<MidToolCallResumeState | null>; // null if the tail is not mid-tool-call
```

### Side-effect tracking (incremental, optional)

`sideEffectStarted` is the one field with no existing source —
`executeToolCalls` does **not** track idempotency
([execute.ts](../packages/tools/src/execute.ts)). This RFC does **not** add an
idempotency layer. Instead:

1. For stream-recovery (the #108 case), `sideEffectStarted` is `false` by
   construction — the log stopped before the agent loop executed anything.
2. The agent loop knows when it enters tool execution; a later change can record
   a per-tool "started" marker in `AgentSnapshot` so `describeMidToolCallResume`
   can be called with `sideEffectStarted: true` when resuming from a checkpoint
   taken mid-execution. Tracked as a follow-up, not blocking this RFC.

### Example

```ts
try {
  await streamText({ resumeKey, continueUpstream: true, store, model });
} catch (err) {
  if (isContinueUpstreamMidToolCallError(err) && err.details) {
    switch (err.details.recommendedAction) {
      case 'resume-upstream':       /* safe to retry continue */ break;
      case 'restart-model-turn':    /* partial args — re-issue turn */ break;
      case 'execute-pending-tools': /* run tools, re-call with results */ break;
      case 'human-review':          /* side effect risk — escalate */ break;
    }
  }
}
```

## Drawbacks

- Adds public surface (one type family + two functions) to maintain.
- `sideEffectStarted` is only fully meaningful after the follow-up agent-loop
  marker lands; until then it is honestly `false` for stream-recovery and the
  field's value for checkpoint-mid-execution resume is best-effort.
- `argsBufferHash` requires a sha-256 dependency in `core` (already available via
  the same primitive `@ziro-agent/audit` uses).

## Alternatives

- **Keep throwing only.** Rejected: forces every host to re-derive recovery
  context, exactly the complaint in #108.
- **Put the state object on a new exception subclass per action.** Rejected:
  more types, harder to pattern-match than one `recommendedAction` enum.
- **Return a result object instead of throwing.** Rejected: would break the
  established `streamText` throw contract; enriching the existing error keeps
  backward compatibility (#108 explicitly asked to *also* expose state, not to
  remove the error).

## Adoption strategy

Fully additive — no migration needed. Existing catch sites ignore `.details`;
new code opts in. Ship in `@ziro-agent/core` + `@ziro-agent/agent` together so
the agent-level re-exports land in the same release.

## Unresolved questions

- Should `lastEventOffset` also carry a provider-native event id when the
  provider exposes one? (RFC 0017 lists provider response IDs as a non-goal;
  this would be opt-in metadata only.)
- Exact home/shape of the side-effect marker in `AgentSnapshot` (deferred to the
  follow-up).
- Whether `human-review` should be auto-selected whenever `inputComplete` is
  true but no results exist, or only when `sideEffectStarted` is true.
</content>
</invoke>
