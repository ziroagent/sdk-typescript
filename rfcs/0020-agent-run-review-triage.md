# RFC 0020: Agent-run review & triage layer

- Start date: 2026-06-07
- Authors: @ziro-agent/maintainers
- Status: **accepted** (2026-06-07) — cleared for implementation
- Affected packages: `@ziro-agent/audit` (read side), new `@ziro-agent/review` (proposed)
- Related: [RFC 0016 — Compliance pack](./0016-compliance-pack.md), [RFC 0002 — Human-in-the-loop](./0002-human-in-the-loop.md), `@ziro-agent/agent`
- Source: community feedback (Luca King, @ctx-pbc) — "how are you dealing with code review volume once you have a few agent runs in flight?"

## Summary

As multiple agent runs execute concurrently, the volume of agent-produced
output that needs human attention (tool calls with side effects, code edits,
risky actions) grows faster than any single reviewer can read linearly. This RFC
proposes a **review/triage layer** built on top of the existing append-only
audit trail (RFC 0016): a query + aggregation + prioritization surface that
turns a flat audit log into a **reviewable, rankable queue** of agent-run
events, so reviewers spend attention where risk is highest instead of reading
every run end-to-end.

## Motivation

The current `@ziro-agent/audit` package is a **write-once, verify-integrity**
primitive: `JsonlAuditLog.append()` chains records by hash; `verifyJsonlAuditLogChain`
validates the chain end-to-end. It has **no read/query surface** — no filter by
`actor` / `action` / time, no aggregation, no notion of "needs review" vs
"auto-approved". Human approval today is per-tool (`requiresApproval` in
`@ziro-agent/agent`) and **synchronous to a single run**; it does not help a
reviewer who is behind on *N* runs at once.

Luca's question — *"code review volume once you have a few agent runs in flight"* —
is exactly this gap. With one run, you read it. With ten concurrent runs, you
need:

- A **queue** across runs, not per-run blocking prompts.
- **Triage signals** so high-risk items (mutating tools, large diffs, low model
  confidence, budget overruns, policy hits) surface first.
- **Sampling** so low-risk/auto-approved runs are spot-checked, not all read.
- A **review verdict** recorded back into the (tamper-evident) trail.

The audit trail already captures the raw material — `action`, `actor`,
`subjectId`, `payload`, `ts` per record. This RFC adds the *read* half.

## Detailed design

### Scope split

- `@ziro-agent/audit` stays the **source of truth** (append-only, RFC 0016).
  This RFC adds **only read helpers** there; all review state is new.
- A new **`@ziro-agent/review`** package holds the triage/queue/verdict logic so
  the audit primitive stays minimal and dependency-free.

### 1. Read surface on `@ziro-agent/audit`

A streaming reader so large JSONL files are not loaded whole (today
`verifyJsonlAuditLogChain` reads the entire file string):

```ts
export interface AuditQuery {
  actor?: string;
  action?: string | string[];
  subjectId?: string;
  since?: string;   // ISO; inclusive
  until?: string;   // ISO; exclusive
  limit?: number;
}

/** Async-iterate records matching a query, in append order, without buffering the whole file. */
export function readJsonlAuditLog(
  source: string | AsyncIterable<string>,
  query?: AuditQuery,
): AsyncIterable<AuditRecord>;
```

No new write paths; chain verification is unchanged and remains the trust root.

### 2. Triage model (`@ziro-agent/review`)

A reviewable item is **derived** from one or more audit records for a run:

```ts
export type ReviewPriority = 'critical' | 'high' | 'normal' | 'low';

export interface ReviewItem {
  runId: string;            // correlation id (audit payload field, see below)
  actor?: string;
  action: string;
  subjectId?: string;
  ts: string;
  priority: ReviewPriority;
  /** Why it was ranked here — human-readable signal names that fired. */
  signals: string[];
  /** Pointer back to the exact audit record(s). */
  recordHashes: string[];
}
```

**Scoring** is pluggable; defaults cover the common risk signals:

```ts
export interface ReviewSignal {
  name: string;
  /** Return a weight (0 = no concern) for a record/run. */
  score(record: AuditRecord): number;
}

export interface TriageConfig {
  signals?: ReviewSignal[];          // defaults below if omitted
  thresholds?: Partial<Record<ReviewPriority, number>>;
  /** Spot-check rate for items that fall to `low` (0..1). */
  sampleLowRate?: number;
}
```

Default signals (each maps cleanly to data already in the SDK):

- `mutating-tool` — tool action flagged as side-effecting (default-deny set,
  RFC 0016 §safety).
- `approval-bypassed` — `requiresApproval` tool that ran without an approver.
- `budget-exceeded` — payload carries a `budgetExceeded` marker (from
  `ToolExecutionResult`).
- `policy-hit` — middleware redaction / prompt-injection block fired
  (`@ziro-agent/middleware`).
- `large-output` / `large-diff` — payload size over a threshold.
- `error` — tool/agent error result.

### 3. Triage + sampling

```ts
export async function triageRuns(
  records: AsyncIterable<AuditRecord>,
  config?: TriageConfig,
): Promise<ReviewItem[]>; // sorted by priority then ts
```

Items above thresholds are always queued; items below fall to `low` and are
**sampled** at `sampleLowRate` so coverage scales sub-linearly with run volume —
the answer to "I can't read every run." When anything is dropped from the queue
by sampling, the count is reported (no silent truncation).

### 4. Review verdict — back into the trail

A verdict is itself an audit action, so the review record is tamper-evident and
chained like everything else (no separate mutable store):

```ts
export interface ReviewVerdict {
  runId: string;
  reviewer: string;
  decision: 'approved' | 'rejected' | 'needs-changes' | 'escalated';
  note?: string;
  itemRecordHashes: string[]; // what was reviewed
}

/** Appends a `review.verdict` record to the audit log. */
export function recordReviewVerdict(
  log: JsonlAuditLog,
  verdict: ReviewVerdict,
): Promise<AuditRecord>;
```

A run's review status is then derived by reading the latest `review.verdict`
record for its `runId` — no extra database required.

### 5. Run correlation

Triage needs a stable `runId` to group records across a run. The agent loop
already has a thread/run identity; this RFC requires the agent's audit emissions
to include `payload.runId` (additive convention, not a schema change — `payload`
is already free-form). Existing logs without it degrade to per-record items.

### 6. CLI

Extend the existing verify-only `ziroagent audit` command:

```
ziroagent review queue   <file.jsonl> [--since ...] [--priority high]
ziroagent review verdict <file.jsonl> --run <id> --decision approved --by me
```

`queue` prints the triaged, prioritized list (the reviewer's worklist);
`verdict` appends a verdict record.

## Drawbacks

- New package + read surface to maintain.
- Default signals encode opinions about "risk"; teams may need to tune
  thresholds before the queue is trustworthy.
- Triage reads the trail but cannot reconstruct anything the agent did **not**
  audit — coverage is only as good as what gets logged.
- JSONL-as-store is fine for single-file / moderate volume; very high volume will
  want an indexed sink (out of scope; the reader interface accepts any
  `AsyncIterable<string>` so a DB-backed source can be substituted).

## Alternatives

- **Extend `@ziro-agent/audit` directly** with triage logic. Rejected: bloats a
  primitive whose value is being minimal and trustworthy; review opinions
  churn faster than the append/verify core should.
- **A live dashboard service.** Out of repo scope; the SDK should ship the
  queryable/triage primitives and let products build UI on top (mirrors how
  RFC 0018 keeps product UI flows out of the repo).
- **Do nothing — rely on per-tool approval.** Rejected: per-tool approval is
  synchronous and per-run; it does not scale to many concurrent runs, which is
  the exact problem raised.

## Adoption strategy

Additive. The read helpers on `@ziro-agent/audit` are new exports; the
`@ziro-agent/review` package is opt-in. Existing logs work immediately for
querying; full triage quality improves once agent emissions carry `payload.runId`
and risk markers. No breaking changes.

## Unresolved questions

- Should triage live entirely offline (read logs) or also offer a streaming
  hook so items are queued as runs execute, not after?
- Standard set + names of default signals — needs a short calibration pass on
  real logs.
- Where `runId` officially belongs: a first-class `AuditRecord` field vs the
  `payload.runId` convention proposed here.
- Relationship to RFC 0002 approval: should an `escalated` verdict be able to
  *re-open* a suspended run, or is review strictly post-hoc?
</content>
