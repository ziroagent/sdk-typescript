# RFC 0006: `Checkpointer` + resumable streams — durable-by-default agents

- Start date: 2026-04-22
- Authors: @ziro-agent/maintainers
- Status: **draft (stub)** — design comments open per `GOVERNANCE.md` until 2026-05-06
- Affected packages: `@ziro-agent/agent`, **new** `@ziro-agent/checkpoint-memory`, `@ziro-agent/checkpoint-postgres`, `@ziro-agent/checkpoint-redis`
- Tracks: v0.2 Track 2 (RFC 0004); supersedes the v0.2 "durable execution adapters first" ordering

## Summary

Introduce a `Checkpointer` interface (`get` / `put` / `list` / `delete`) in
`@ziro-agent/agent`, ship three storage adapters (memory / postgres / redis),
and add `agent.resumeFromCheckpoint(threadId)` plus
`streamText({ resumeKey, resumeFromIndex })` for resumable streams. Together
with the existing `AgentSnapshot` from RFC 0002, this delivers
**durable-by-default** for the seconds-to-minutes case — without requiring
Temporal, Inngest, or Restate.

## Motivation

Per RFC 0004 §Issue 2, three competitor patterns prove that
durable-without-Temporal is the more common production need:

- **LangGraph JS** — `Checkpointer` interface + `threadId` + `interrupt()`.
- **Strands Agents** — `SessionManager` with three save strategies
  (`invocation` / `message` / `trigger`) and UUID v7 immutable snapshot ids.
- **Mastra** — resumable streams via cached event log, `streamText` resumes
  from sequential index after disconnect.

Most production agents run for *seconds to minutes* and need to survive
process restart / hot-reload / browser-tab close — not multi-day human waits.
The current `AgentSnapshot` covers in-memory state but has no shipped
persistence story. Adding a 4-method interface + 3 adapters gives 80% of the
durable story in 2 weeks. Temporal / Inngest then become the
*long-running / cross-day* adapters, not the *only* path to durability.

## Detailed design (sketch — to be expanded)

### `Checkpointer` interface

```ts
export interface Checkpointer {
  put(threadId: string, snapshot: AgentSnapshot): Promise<CheckpointId>;
  get(threadId: string, checkpointId?: CheckpointId): Promise<AgentSnapshot | null>;
  list(threadId: string, opts?: { limit?: number }): Promise<CheckpointMeta[]>;
  delete(threadId: string, checkpointId?: CheckpointId): Promise<void>;
}

export type CheckpointId = string; // UUID v7
export interface CheckpointMeta {
  id: CheckpointId;
  threadId: string;
  createdAt: Date;
  agentSnapshotVersion: number;
  sizeBytes: number;
}
```

UUID v7 chosen for monotonic ordering (matches Strands; lets `list` pull most
recent without server-side sort).

### Save strategies

Three strategies (Strands-inspired), defaulting to `message`:

```ts
const agent = createAgent({
  model,
  tools,
  checkpoint: {
    adapter: postgresCheckpointer({ pool }),
    threadId: req.headers['x-conversation-id'],
    strategy: 'message', // 'invocation' | 'message' | 'trigger'
  },
});
```

- `invocation` — one snapshot per `agent.run` (lightest).
- `message` — one snapshot per LLM message returned (default; matches LangGraph
  per-step checkpointing).
- `trigger` — caller decides via `await agent.checkpoint()`.

### Resume APIs

```ts
const result = await agent.resumeFromCheckpoint(threadId);
const result = await agent.resumeFromCheckpoint(threadId, checkpointId);
const checkpoints = await agent.listCheckpoints(threadId, { limit: 10 });
```

Resume reuses the existing `agent.resume(snapshot, decision)` plumbing from
RFC 0002 — no new agent-loop branch.

### Resumable streams

```ts
const { stream, resumeKey } = await streamText({
  model,
  messages,
  resumable: true, // server returns a resumeKey
});

const { stream } = await streamText({
  resumeKey,
  resumeFromIndex: lastSeenIndex, // client tells server which event was last seen
});
```

Server caches stream events in a pluggable `ResumableStreamEventStore`, keyed
by `resumeKey` with a TTL (Redis adapter). **Shipped:** replay of cached
`ModelStreamPart` slices, optional **`continueUpstream: true`** to replay then
append a live `model.stream` into the same log when the session is incomplete,
optional Redis single-writer lock, session metadata (`getSessionMeta`), and
optional **`expectedNextIndex`** stale-client guard — see
[RFC 0017 — resumable streamText, continue upstream](./0017-resumable-stream-continue-upstream.md).

### Postgres adapter schema

```sql
CREATE TABLE ziro_checkpoints (
  id            UUID PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot_version SMALLINT NOT NULL,
  payload       JSONB NOT NULL,
  size_bytes    INTEGER NOT NULL
);
CREATE INDEX ON ziro_checkpoints (thread_id, created_at DESC);
-- per-thread row lock prevents concurrent resume races
SELECT pg_advisory_xact_lock(hashtext(thread_id)) FROM ...;
```

### Redis adapter

`HSET ziro:checkpoint:<threadId> <checkpointId> <payload>` plus a
`ZADD ziro:checkpoint:<threadId>:idx <createdAtUnixMs> <checkpointId>` for
`list` ordering.

## Drawbacks

- One more package to maintain per backend (memory + postgres + redis = 3).
  Mitigation: postgres + redis share 80% via a `KvCheckpointer` base adapter.
- `JSONB` payload size grows quickly with long conversations. Mitigation: ship
  a `compress: true` option using `zstd` (Node 22+).
- Schema migration burden. Mitigation: ship Drizzle / Kysely migration files
  in adapter packages.

## Alternatives

- **Just persist `AgentSnapshot` to user storage.** Rejected: every team
  reinvents the same 4-method interface; LangGraph and Strands both validate
  the abstraction is worth shipping.
- **Couple the checkpointer to a specific durable backend** (Inngest /
  Temporal). Rejected: the 80%-case doesn't need them, and tying the API
  forces backend lock-in.
- **Stream resumability via the durable adapter only.** Rejected: most stream
  drops are 5-second browser-tab issues, not multi-day waits — durable adapters
  are overkill.

## Adoption strategy

- New API; non-breaking. `agent.run()` without `checkpoint:` is unchanged.
- v0.1.x snapshot users: keep using `agent.resume(snapshot, decision)`. Adding
  a checkpointer just persists the snapshot for you.
- Migration cookbook: "from in-memory snapshot to Postgres checkpointer in 5
  lines".

## Unresolved questions

- **Should `WorkingMemory` (RFC 0007 / v0.3 Track 4) share the same
  `Checkpointer` adapter or its own?** Sharing reduces backends to maintain;
  splitting allows different retention policies (long-lived working memory vs.
  short-lived checkpoints).
- **TTL semantics.** Should checkpoints auto-expire (Redis-style) or be
  retained indefinitely (Postgres-style) by default? Currently leaning
  *adapter-decides*.
- **Cross-realm `AgentSnapshot` deserialization.** Snapshot version 2 from RFC
  0004 v0.1.9 work needs to land first or be coordinated with this RFC.
- **Concurrent resume of the same thread.** Postgres advisory lock handles it;
  Redis lacks a clean equivalent. Use SETNX-with-TTL? Or document
  single-writer expectation?
