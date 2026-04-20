---
'@ziro-agent/checkpoint-postgres': minor
---

**New: `@ziro-agent/checkpoint-postgres` — production Postgres `Checkpointer` adapter (RFC 0006).**

Persists `AgentSnapshot` payloads to Postgres with row-locked atomicity and UUID v7 lexicographically-sortable ids. Pair with `agent.resumeFromCheckpoint(threadId)` to survive crashes, deploys, and HITL pauses across processes.

Surface:
- `PostgresCheckpointer` — implements the full `Checkpointer` contract (`put` / `get` / `list` / `delete`).
- `PgQueryable` — structural pool interface (only `query(sql, params)` required). `pg` is a peerDependency: bring your own driver, never pinned.
- `ensureCheckpointsSchema(pool, opts?)` — idempotent DDL helper. Prefer copying the SQL into your migration tool (Flyway / Atlas / drizzle-kit / Prisma migrate).
- `uuidv7(now?)` — re-exported time-sortable id generator (no extra dep).

Concurrency guarantees:
- `put` is atomic per `(thread_id, checkpoint_id)` via the PRIMARY KEY. UUID v7 ids are client-side generated so concurrent writes to the same thread cannot collide.
- `maxCheckpointsPerThread` trim runs in the SAME statement as the insert (a CTE) — crash mid-trim leaves a consistent state.

Identifier safety:
- Schema/table names validated against `[a-zA-Z_][a-zA-Z0-9_]*` and quoted before interpolation. Any deviation throws at construction time.

Testability:
- The structural `PgQueryable` pool means tests don't need a real Postgres. Our own 13-test suite uses an in-memory stub; see `src/postgres-checkpointer.test.ts`.

No breaking changes — interface-compatible drop-in for `MemoryCheckpointer` from `@ziro-agent/checkpoint-memory`.
