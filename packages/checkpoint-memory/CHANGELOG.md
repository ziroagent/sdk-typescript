# @ziro-agent/checkpoint-memory

## 0.2.2

### Patch Changes

- Updated dependencies [[`ec901c8`](https://github.com/ziroagent/sdk-typescript/commit/ec901c8554bc0f4e1577eeff8a5ab1b386c9097a)]:
  - @ziro-agent/agent@0.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [33e8de0]
  - @ziro-agent/agent@0.5.0

## 0.2.0

### Minor Changes

- cdfad7c: **Initial release — in-memory `Checkpointer` adapter (RFC 0006 reference)**

  Bootstraps the durable-execution story for the v0.2 milestone: a
  process-local, dependency-free `Checkpointer` implementation suitable
  for tests, examples, and single-process deployments.

  - Implements the full `Checkpointer` contract from `@ziro-agent/agent`:
    `put` / `get` / `list` / `delete` with deep-clone isolation on read
    and write.
  - Time-sortable UUID v7 ids so `list()` is naturally chronological.
  - Configurable `maxCheckpointsPerThread` with FIFO eviction (default
    `100`) to bound memory in long-running processes.
  - Zero peer-dependency surprises — only depends on
    `@ziro-agent/agent`.

  Production deployments should still wait for
  `@ziro-agent/checkpoint-postgres` and `@ziro-agent/checkpoint-redis`
  shipping in v0.2 (see RFC 0006 §adapters).

### Patch Changes

- Updated dependencies
- Updated dependencies [cdfad7c]
  - @ziro-agent/agent@0.4.0
