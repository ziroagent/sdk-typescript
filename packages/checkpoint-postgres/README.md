# `@ziro-agent/checkpoint-postgres`

Production-grade Postgres `Checkpointer` for ZiroAgent SDK. Persists
`AgentSnapshot` payloads with row-locked atomicity and UUID v7
lexicographically-sortable ids. Pair with `agent.resumeFromCheckpoint`
to survive crashes, deploys, and HITL pauses across processes.

Per [RFC 0006](../../rfcs/0006-checkpointer.md) §adapters; ships in
v0.2.

## Install

```bash
npm install @ziro-agent/checkpoint-postgres pg
# Peer dep is `pg >= 8.10`. Bring your own driver — we never pin a
# major version your deploy is trying to upgrade past.
```

## Quick start

```ts
import { Pool } from 'pg';
import { createAgent } from '@ziro-agent/agent';
import {
  PostgresCheckpointer,
  ensureCheckpointsSchema,
} from '@ziro-agent/checkpoint-postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Run ONCE at boot (or copy the SQL into your migration tool):
await ensureCheckpointsSchema(pool);

const agent = createAgent({
  model,
  tools,
  checkpointer: new PostgresCheckpointer({ pool }),
  defaultThreadId: 'support-conversation-42',
});

try {
  await agent.run({ prompt: '...' });
} catch (err) {
  // Snapshot was already auto-persisted on suspension. After a
  // restart, just resume from the thread id:
  await agent.resumeFromCheckpoint('support-conversation-42', { approver });
}
```

## Schema

`ensureCheckpointsSchema(pool, { schema?, table? })` runs:

```sql
CREATE TABLE IF NOT EXISTS public.ziro_checkpoints (
  thread_id     TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  snapshot      JSONB NOT NULL,
  version       INTEGER NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, checkpoint_id)
);
CREATE INDEX IF NOT EXISTS ziro_checkpoints_thread_idx
  ON public.ziro_checkpoints (thread_id, checkpoint_id DESC);
```

It's safe to call repeatedly (idempotent), but **prefer copying this
SQL into your migration tool** (Flyway, Atlas, drizzle-kit, Prisma
migrate). Implicit DDL on a hot path is a multi-process footgun.

## Options

```ts
new PostgresCheckpointer({
  pool,
  schema: 'public',           // identifier — only [a-zA-Z_][a-zA-Z0-9_]*
  table:  'ziro_checkpoints',
  maxCheckpointsPerThread: 100, // trim oldest in same INSERT; Infinity disables
  now: () => Date.now(),        // override for tests / determinism
});
```

## Concurrency

- `put` is atomic per `(thread_id, checkpoint_id)` via the PRIMARY
  KEY. UUID v7 ids are generated client-side so two concurrent writes
  to the same thread can never collide.
- The trim-on-cap pass runs **inside the same statement** as the
  insert (a CTE), so a crash mid-trim leaves a consistent state, never
  a torn cap.
- All other methods (`get`, `list`, `delete`) are simple
  single-statement reads / writes — your pool's normal connection
  semantics apply.

## Testability

Tests don't need a real Postgres. The `pool` parameter is structurally
typed (`PgQueryable`) — pass any `{ query(sql, params) }` shape:

```ts
import { PostgresCheckpointer } from '@ziro-agent/checkpoint-postgres';

const stub = { async query() { return { rows: [] }; } };
const cp = new PostgresCheckpointer({ pool: stub });
```

This is the same hatch we use in our own test suite — see
`src/postgres-checkpointer.test.ts` for an in-memory implementation
that emulates the four statement shapes the adapter actually emits.

## See also

- [`@ziro-agent/checkpoint-memory`](../checkpoint-memory) — same
  interface, in-memory; use in tests + single-process deploys.
- [RFC 0006 — Checkpointer](../../rfcs/0006-checkpointer.md)
- [Agent docs — `resumeFromCheckpoint`](../agent/README.md)
