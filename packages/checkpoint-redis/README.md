# @ziro-agent/checkpoint-redis

Redis adapter for the ZiroAgent SDK [`Checkpointer`](https://ziroagent.com/docs/checkpointer)
interface (RFC 0006).

```bash
pnpm add @ziro-agent/checkpoint-redis ioredis
# or
pnpm add @ziro-agent/checkpoint-redis redis
```

## Quick start

### with `ioredis`

```ts
import { createAgent } from '@ziro-agent/agent';
import { fromIoRedis, RedisCheckpointer } from '@ziro-agent/checkpoint-redis';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL!);

const checkpointer = new RedisCheckpointer({
  client: fromIoRedis(redis),
  ttlSeconds: 7 * 24 * 3600,        // GC abandoned threads after 7 days
  maxCheckpointsPerThread: 50,      // keep last 50 snapshots per thread
});

const agent = createAgent({
  model,
  checkpointer,
  defaultThreadId: 'user:42',
});
```

### with `redis` (node-redis v4+)

```ts
import { createClient } from 'redis';
import { fromNodeRedis, RedisCheckpointer } from '@ziro-agent/checkpoint-redis';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const checkpointer = new RedisCheckpointer({
  client: fromNodeRedis(client),
});
```

### bring-your-own client

The adapter only needs a single method. If you're using a sandboxed client
(Cloudflare Workers, Edge, etc), implement the `RedisLike` surface
yourself:

```ts
const checkpointer = new RedisCheckpointer({
  client: {
    async command(args) {
      return myCustomTransport(args);
    },
  },
});
```

## Resumable `streamText` event log

Use `RedisResumableStreamEventStore` with `streamText({ resumable: true, streamEventStore })` from `@ziro-agent/core` so cached `ModelStreamPart` events can be replayed after a disconnect (same semantics as the in-memory store, backed by Redis with optional TTL). See the [resumable streamText cookbook](https://ziroagent.com/docs/cookbooks/resumable-stream-text).

```ts
import { streamText } from '@ziro-agent/core';
import IORedis from 'ioredis';
import { fromIoRedis, RedisResumableStreamEventStore } from '@ziro-agent/checkpoint-redis';

const redis = new IORedis(process.env.REDIS_URL!);
const streamEventStore = new RedisResumableStreamEventStore({
  client: fromIoRedis(redis),
  ttlSeconds: 3600,
});

const result = await streamText({
  model,
  prompt: 'Hello',
  resumable: true,
  streamEventStore,
});
```

Default stream key prefix is `ziro:st` (separate from the checkpointer’s `ziro:cp`).

## Key layout

With the default `keyPrefix = "ziro:cp"`:

| Key                              | Type   | Purpose                                   |
| -------------------------------- | ------ | ----------------------------------------- |
| `ziro:cp:idx:<threadId>`         | ZSET   | id → ms timestamp (newest = highest rank) |
| `ziro:cp:snap:<threadId>:<id>`   | STRING | JSON-encoded `AgentSnapshot`              |

Pick a different `keyPrefix` to isolate environments or share a Redis
between SDK installations.

## Concurrency model

- IDs are UUID v7 generated client-side, so two concurrent `put()` calls
  to the same `threadId` never collide on the snapshot key.
- The trim pass that enforces `maxCheckpointsPerThread` runs as
  separate Redis commands AFTER the new snapshot is committed. A crash
  mid-trim leaves at most `cap+1` checkpoints — never fewer than `cap`.
  Postgres adapter does this atomically via a CTE; we accept the
  trade-off for Redis.
- TTL is set per-key on `put`, both for the snapshot payload and for
  the index ZSET. Long-abandoned threads GC themselves without a
  cleanup job.

## When to pick this vs `@ziro-agent/checkpoint-postgres`

| Need                                       | Choose Redis                          | Choose Postgres                          |
| ------------------------------------------ | ------------------------------------- | ---------------------------------------- |
| Sub-millisecond reads                      | ✅                                    | ❌ (network + parse overhead dominates)  |
| You already run Redis                      | ✅                                    | —                                        |
| You already run Postgres                   | —                                     | ✅                                       |
| Snapshot size > 1 MiB regularly            | ⚠️ (Redis values can be large but eviction policies bite) | ✅ (JSONB scales) |
| Auto-eviction of abandoned threads         | ✅ (TTL native)                       | ⚠️ (run a periodic DELETE job)          |
| Atomic trim-on-cap                         | ❌ (best effort)                      | ✅ (CTE in `put`)                        |
| Hot-cold tiering, point-in-time queries    | ❌                                    | ✅                                       |

If both are options and you want a single source of truth, run Postgres
in production and Redis as a hot cache only after measuring the latency
gap matters.
