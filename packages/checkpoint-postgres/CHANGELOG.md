# @ziro-agent/checkpoint-postgres

## 0.3.1

### Patch Changes

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/agent@0.7.0

## 0.3.0

### Minor Changes

- [`c42b89f`](https://github.com/ziroagent/sdk-typescript/commit/c42b89f5fb88644be106194bd475d28471de04e1) - **New: `@ziro-agent/checkpoint-postgres` — production Postgres `Checkpointer` adapter (RFC 0006).**

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

### Patch Changes

- Updated dependencies [[`ec901c8`](https://github.com/ziroagent/sdk-typescript/commit/ec901c8554bc0f4e1577eeff8a5ab1b386c9097a)]:
  - @ziro-agent/agent@0.6.0
