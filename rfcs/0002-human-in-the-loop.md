# RFC 0002: Human-in-the-loop — approval gates + suspend/resume

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **accepted (v0.1.7)**
- Affected packages: `@ziro-agent/core`, `@ziro-agent/tools`, `@ziro-agent/agent`, `@ziro-agent/tracing`

## Summary

Introduce a first-class human-in-the-loop (HITL) primitive: any tool can declare
`requiresApproval` (boolean **or** `(input, ctx) => boolean | Promise<boolean>`),
and the agent loop either resolves the approval **inline** through a caller-
supplied `Approver` callback or **suspends** the run by serializing its full
state to an `AgentSnapshot` and throwing `AgentSuspendedError`. The caller
persists the snapshot in any KV store and later calls `agent.resume(snapshot,
{ decisions })` to continue — token usage, budget scope, message history,
and pending sibling tool calls all carry forward.

This is the production-safety primitive #2 on Ziro's roadmap, paired with
RFC 0001 (Budget Guard). Both stop the agent loop **gracefully**, on a typed
exception the caller can branch on — the difference is *what* is being
guarded (cost vs. side-effects).

## Motivation

Documented production-failure modes that HITL solves:

- An agent with `send_email` / `transfer_funds` / `delete_repository` tools
  must not be allowed to act without human sign-off, even if the LLM is
  "confident".
- Agentic workflows that span hours or days (compliance reviews, refund
  approvals, escalations) need to **pause** without holding a Node.js
  process open and **resume** in a fresh process / pod.
- Auditors require a recorded approval trail: who approved what, when, with
  which input.

Existing TypeScript SDKs:

| SDK | Approval gate | Suspend/resume |
|---|---|---|
| Vercel AI SDK | ❌ user must wrap `tool.execute` manually | ❌ |
| Mastra | partial (`requireConfirmation`) | ❌ |
| LangGraph.js | `interrupt()` primitive | ✅ but tied to `MemorySaver`, not portable |
| Inngest / Temporal | ✅ at workflow level, not tool level | ✅ via durable execution |

None ship a primitive that is (a) tool-declared, (b) framework-agnostic
storage, (c) composes with budget. RFC 0002 fills that gap.

## Detailed design

### Core types (in `@ziro-agent/core/hitl`)

```ts
export interface ApprovalRequest {
  /** Stable id of the tool invocation awaiting approval. */
  toolCallId: string;
  toolName: string;
  toolDescription?: string;
  /** Already-validated input (Zod-parsed) — what the tool would actually receive. */
  input: unknown;
  /** Raw args from the model — useful for auditing input drift. */
  rawArgs: unknown;
  /** Read-only loop context. */
  context: {
    step: number;                       // 1-indexed step where the tool call originated
    messages: ReadonlyArray<unknown>;   // ChatMessage[] at the moment of the call
    metadata?: Record<string, unknown>; // free-form (session id, user id, …)
  };
}

export type ApprovalDecision =
  | { decision: 'approve'; modifiedInput?: unknown }
  | { decision: 'reject'; reason?: string }
  | { decision: 'suspend' };

export type Approver = (req: ApprovalRequest) =>
  ApprovalDecision | Promise<ApprovalDecision>;
```

Three exit shapes intentionally:

- **`approve`** — run `tool.execute(modifiedInput ?? input)`. `modifiedInput`
  re-runs through the tool's Zod `input` schema (so the human can correct a
  hallucinated argument and the tool still gets a validated payload).
- **`reject`** — `tool.execute` is **never** called. The tool result becomes
  `{ isError: true, result: { name: 'ApprovalRejected', message: reason ?? '...' }}`
  and the loop continues with that as the model's tool message — so the LLM
  can react ("I tried to send the email, the user declined, here's an
  alternative…").
- **`suspend`** — `tool.execute` is **never** called. The loop builds an
  `AgentSnapshot`, throws `AgentSuspendedError`, and unwinds.

### Tool-level declaration (in `@ziro-agent/tools`)

```ts
defineTool({
  name: 'transfer_funds',
  description: 'Move money between accounts.',
  input: z.object({ from: z.string(), to: z.string(), amountUsd: z.number() }),
  // Boolean form — every call needs approval.
  requiresApproval: true,
  // OR function form — only when amount > $100.
  requiresApproval: (input) => input.amountUsd > 100,
  execute: async (input) => bank.transfer(input),
});
```

`requiresApproval: false` (or omitted) is the default — zero overhead, no
approver consulted.

### `executeToolCalls` integration

```ts
executeToolCalls({
  toolCalls,
  tools,
  approver?: Approver,        // NEW
  toolBudget,
  abortSignal,
  metadata,
})
```

For each tool call, after `tool.input.parse(call.args)` succeeds:

1. If `tool.requiresApproval` is unset/false → run as before.
2. Otherwise evaluate the gate (boolean or function). If it returns false →
   run as before.
3. If the gate is true and `approver` is **missing** → return
   `{ pendingApproval: { parsedInput, rawArgs }, isError: false, result: null, … }`
   — `tool.execute` is **not** called.
4. If `approver` is supplied → call it. Branch on the returned `decision`
   (`approve` / `reject` / `suspend` per above).

The new `pendingApproval` field on `ToolExecutionResult` is the signal the
agent layer uses to suspend.

### Agent-level integration (in `@ziro-agent/agent`)

```ts
agent.run({
  prompt,
  approver?: Approver,         // NEW — inline approval path
  budget,
  toolBudget,
  ...
})
```

After each `executeToolCalls` returns, the loop checks `pendingApproval`:

```ts
const pending = toolResults.filter(r => r.pendingApproval);
if (pending.length > 0) {
  const snapshot = buildSnapshot({
    messages, steps, totalUsage,
    triggeringStep: stepIndex,
    pendingCalls: pending,
    // sibling calls (in this batch, not yet run because we short-circuited)
    siblingCallIds: nonPendingPlannedCallIds,
    budgetSpec: ro.budget,
    budgetUsage: getCurrentBudget()?.used,
  });
  throw new AgentSuspendedError({ snapshot });
}
```

Note: in v0.1.7 the **whole batch** suspends at the first `pendingApproval`
result. This matches Vercel AI SDK / LangGraph semantics and keeps the
snapshot small. Per-call partial-execution is a v0.2 enhancement.

### `agent.resume` API

```ts
agent.resume(snapshot: AgentSnapshot, options: AgentResumeOptions): Promise<AgentRunResult>

interface AgentResumeOptions {
  /** Map of toolCallId → decision for every pending call in the snapshot. */
  decisions: Record<string, ApprovalDecision>;
  /** Re-supply (or replace) the budget; original usage carries forward. */
  budget?: BudgetSpec;
  /** For any FURTHER approvals that come up after resume. */
  approver?: Approver;
  toolBudget?: BudgetSpec;
  abortSignal?: AbortSignal;
  onEvent?: StepEventListener;
}
```

Resume mechanics:

1. Open a budget scope using `withBudget(opts.budget ?? snapshot.budgetSpec,
   fn, { presetUsage: snapshot.budgetUsage })` — see the *Core change* below.
2. Reconstruct loop state (`messages`, `steps`, `totalUsage`) from the
   snapshot.
3. Re-run **only** the pending tool calls, applying each `decisions[id]`:
   - `approve` → run `tool.execute(modifiedInput ?? snapshot input)`.
   - `reject` → synthesize an error tool result.
   - `suspend` → re-build the snapshot (decision was "still waiting"); the
     loop throws `AgentSuspendedError` again.
4. Append tool messages, continue from step `snapshot.step + 1` until
   completion / `maxSteps` / next suspension.

### Snapshot shape

```ts
export interface AgentSnapshot {
  version: 1;
  /** Stable user-supplied id; used by the caller's storage layer. */
  agentId?: string;
  createdAt: string;          // ISO timestamp
  scopeId?: string;           // budget scope id, when applicable
  /** 1-indexed step where suspension happened. */
  step: number;
  messages: ChatMessage[];
  steps: AgentStep[];
  totalUsage: TokenUsage;
  budgetUsage?: BudgetUsage;
  budgetSpec?: SerializableBudgetSpec; // see "Serialization" below
  pendingApprovals: PendingApproval[];
}

interface PendingApproval {
  toolCallId: string;
  toolName: string;
  toolDescription?: string;
  parsedInput: unknown;
  rawArgs: unknown;
}
```

`SerializableBudgetSpec = Omit<BudgetSpec, 'onExceed'> & { onExceed?: 'throw' | 'truncate' }`
— the function form of `onExceed` cannot survive serialization. Resume
silently falls back to `'throw'` unless the caller re-supplies a `budget`.

### `AgentSuspendedError`

```ts
export class AgentSuspendedError extends Error {
  readonly name = 'AgentSuspendedError';
  readonly snapshot: AgentSnapshot;
  /** True for any object branded as a Ziro suspension (cross-realm safe). */
  readonly __ziro_suspended__: true;
  constructor(args: { snapshot: AgentSnapshot; message?: string });
}
```

Thrown from `agent.run()`. Caller is expected to `JSON.stringify(snapshot)`
to whatever store they prefer.

### Core change: `withBudget` `presetUsage`

```ts
export function withBudget<T>(
  spec: BudgetSpec,
  fn: () => Promise<T>,
  options?: { presetUsage?: BudgetUsage }
): Promise<T>;
```

When `presetUsage` is provided, the new scope is opened with that usage
already counted (instead of zero). Used by `agent.resume` for budget
continuity across suspensions: a 24-hour HITL pause cannot accidentally
reset the spend counter.

### Tracing (in `@ziro-agent/tracing`)

`instrumentApproval()` (paralleling the existing `instrumentBudget()`)
subscribes to a new `ApprovalObserver` interface in core and emits:

| Event | Span/event | Attributes |
|---|---|---|
| Approval requested | event `ziro.approval.requested` | `tool.name`, `tool.callId`, `step` |
| Approve granted | event `ziro.approval.granted` | + `modified` (boolean) |
| Approve rejected | event `ziro.approval.rejected` | + `reason` |
| Suspended | event `ziro.approval.suspended` | + `pendingCount` |
| Run suspended | span `ziro.agent.suspended` | `agent.id`, `step`, `pendingCount` |
| Run resumed | span `ziro.agent.resumed` | + `decisions.approve`, `decisions.reject`, `decisions.suspend` (counts) |

Same decoupling pattern as RFC 0001 — `core` exposes the observer hook,
`tracing` subscribes; no direct dependency.

## How approval composes with budget

The two primitives are independent and orthogonal:

- Approval blocks **side-effects** (the tool's `execute()`) before they run.
- Budget blocks **spend** (LLM calls, accumulated cost) before it happens.

Order of evaluation per tool call: budget pre-flight (parent scope) →
approval gate → tool budget pre-flight → `tool.execute()`. A budget overrun
during an in-flight tool execution still throws `BudgetExceededError`; an
approval rejection during a long-suspended run still respects the original
budget when it eventually resumes (because `presetUsage` carries forward).

## Alternatives considered

1. **Always serialize, never inline** — simpler API, but forces every HITL
   user to set up storage even for unit tests / CLI prompts. Rejected.
2. **Per-call partial execution** — let some tool calls in a batch run while
   others wait for approval. Possible but doubles snapshot complexity (need
   to record which calls already produced results). Deferred to v0.2.
3. **Storage adapters in core** — bake Postgres/Redis snapshot stores into
   `@ziro-agent/agent`. Rejected: violates "core stays small" principle.
   v0.2 ships `@ziro-agent/checkpoint-postgres` etc. as separate packages.
4. **Reuse `BudgetResolution`-style return** for `Approver` — collapses the
   three decisions into `{ handled, replacement }`. Rejected: less
   discoverable, and `'reject'` semantically returns an error result, not a
   replacement.

## Unresolved questions

- **Q1**: Should `pendingApproval` results count against `maxSteps` /
  `BudgetSpec.maxLlmCalls`? Current answer: the LLM call that produced the
  tool calls already counted; the `pendingApproval` short-circuit does not
  add any new cost, so suspension does not consume additional steps. Resume
  picks up at `step + 1`.
- **Q2**: Snapshot encryption / signing. v0.1.7 returns an in-memory object;
  storage and integrity are user concerns. v0.2 may add an HMAC helper.
- **Q3**: Tool-side audit trail (who approved/rejected, with which
  identity). v0.1.7 leaves this to the `metadata` field passed through to
  the approver. A first-class `auditor` hook is on the v0.2 list.

## Rollout plan

| Layer | Status |
|---|---|
| `@ziro-agent/core` (HITL types, `withBudget` `presetUsage`, `ApprovalObserver`) | shipping in v0.1.7 |
| `@ziro-agent/tools` (`requiresApproval` field, `executeToolCalls` `approver`) | shipping in v0.1.7 |
| `@ziro-agent/agent` (`Approver` parameter, `AgentSuspendedError`, `agent.resume`) | shipping in v0.1.7 |
| `@ziro-agent/tracing` (`instrumentApproval`) | shipping in v0.1.7 |
| Examples (`examples/agent-with-approval`) | shipping in v0.1.7 |
| Storage adapters (Postgres/Redis/S3) | RFC 0003, v0.2 |
| Temporal / Inngest workflow integration | v0.2 |
| Per-call partial execution within a batch | v0.2 |
| Snapshot HMAC + auditor hook | v0.2 |
