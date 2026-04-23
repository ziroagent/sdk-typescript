# @ziro-agent/checkpoint-postgres

## 0.3.12

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/agent@0.17.1

## 0.3.11

### Patch Changes

- Updated dependencies [[`2c590ad`](https://github.com/ziroagent/sdk-typescript/commit/2c590adb0038a8fe4dc32b5ee62a4f9274ba4df1)]:
  - @ziro-agent/agent@0.17.0

## 0.3.10

### Patch Changes

- Updated dependencies [[`8e3c3d7`](https://github.com/ziroagent/sdk-typescript/commit/8e3c3d71d3f326ac311af34da8140c9d3e2e738a)]:
  - @ziro-agent/agent@0.16.0

## 0.3.9

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/agent@0.15.0

## 0.3.8

### Patch Changes

- Updated dependencies [[`b4c57ee`](https://github.com/ziroagent/sdk-typescript/commit/b4c57ee6c1a7c817763e403d660e400bd367a27b), [`1fc781a`](https://github.com/ziroagent/sdk-typescript/commit/1fc781a764db86c469e496625d09902dc64f8180), [`ad1bd03`](https://github.com/ziroagent/sdk-typescript/commit/ad1bd03ba2dfde2eb7f8be4b2a0000845d932f48)]:
  - @ziro-agent/agent@0.14.0

## 0.3.7

### Patch Changes

- Updated dependencies [[`1354315`](https://github.com/ziroagent/sdk-typescript/commit/1354315b2d2de6f13744a962039541301a1ffef6)]:
  - @ziro-agent/agent@0.13.0

## 0.3.6

### Patch Changes

- Updated dependencies [[`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4), [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4)]:
  - @ziro-agent/agent@0.12.0

## 0.3.5

### Patch Changes

- Updated dependencies [[`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e)]:
  - @ziro-agent/agent@0.11.0

## 0.3.4

### Patch Changes

- Updated dependencies [[`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14)]:
  - @ziro-agent/agent@0.10.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`3f3695d`](https://github.com/ziroagent/sdk-typescript/commit/3f3695d760ba00daaf1850ff4970c9069e42533d), [`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7)]:
  - @ziro-agent/agent@0.9.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/agent@0.8.0

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
