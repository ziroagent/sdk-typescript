# @ziro-agent/checkpoint-memory

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
