import type { AgentSnapshot, Checkpointer, CheckpointId, CheckpointMeta } from '@ziro-agent/agent';
import { uuidv7 } from './uuid7.js';

/**
 * Minimal subset of a Redis client we depend on. Typed structurally so
 * callers can pass:
 *
 *   - an `ioredis` client wrapped via {@link fromIoRedis}
 *   - a `redis` (node-redis v4+) client wrapped via {@link fromNodeRedis}
 *   - any custom client matching the `command()` shape — useful for
 *     tests, recording proxies, or sandboxed mocks
 *
 * The structural typing is the whole reason `ioredis` / `redis` are
 * `peerDependencies` (both optional): consumers bring their own driver
 * and we never pin a major version they're trying to deploy.
 *
 * `command(args)` MUST return Redis's standard wire-protocol reply:
 *
 *   - `string | null` for bulk replies (GET, ZSCORE, ZRANGE single value)
 *   - `string[]` for array bulk (ZRANGE / ZRANGEBYSCORE / KEYS)
 *   - `number` for integer reply (DEL, ZADD, ZCARD)
 *   - `'OK'` for status reply (SET)
 */
export interface RedisLike {
  command<T = unknown>(args: readonly (string | number)[]): Promise<T>;
}

export interface RedisCheckpointerOptions {
  /**
   * Redis client / queryable used for every command. Pass a wrapped
   * `ioredis` or `redis` client; pass a stub conforming to
   * {@link RedisLike} for tests.
   */
  client: RedisLike;
  /**
   * Prefix prepended to every key. Defaults to `ziro:cp`. Set this to
   * isolate multiple SDK instances or to align with your existing
   * key-naming convention.
   */
  keyPrefix?: string;
  /**
   * Hard cap on retained checkpoints per `threadId`. When exceeded
   * the oldest checkpoints are deleted on the next `put`.
   *
   * NOTE: trim is best-effort — it runs as separate Redis commands
   * AFTER the new checkpoint is committed (Postgres adapter does it
   * atomically via a CTE). A crash mid-trim leaves at most `cap+1`
   * checkpoints, never fewer than `cap`. Acceptable trade-off given
   * Redis's lack of cheap multi-key transactions for our shape.
   *
   * Default `100` (matches the in-memory adapter). Pass `Infinity`
   * to disable trimming.
   */
  maxCheckpointsPerThread?: number;
  /**
   * Optional TTL applied to each snapshot's payload key (in seconds).
   * The index ZSET inherits the same TTL on every put. Useful for
   * automatic GC of long-abandoned conversations without running a
   * cleanup job.
   *
   * Default: no TTL (keys live forever or until trimmed).
   */
  ttlSeconds?: number;
  /** Override for tests / determinism. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Production-grade {@link Checkpointer} backed by Redis. Designed for
 * deployments that already run Redis as their session / queue store
 * and want a single low-latency place to keep agent state.
 *
 * Key layout (with default `keyPrefix = "ziro:cp"`):
 *
 *   `ziro:cp:idx:<threadId>`         ZSET — member: checkpointId, score: ms timestamp
 *   `ziro:cp:snap:<threadId>:<id>`   STRING — JSON-encoded {@link AgentSnapshot}
 *
 * Concurrency: UUID v7 ids are generated client-side so two concurrent
 * `put` calls to the same thread never collide on the snapshot key.
 * The trim pass is intentionally non-transactional — see
 * {@link RedisCheckpointerOptions.maxCheckpointsPerThread}.
 *
 * Per RFC 0006 §adapters; ships in v0.2.
 */
export class RedisCheckpointer implements Checkpointer {
  private readonly client: RedisLike;
  private readonly prefix: string;
  private readonly cap: number;
  private readonly ttl: number | undefined;
  private readonly now: () => number;

  constructor(opts: RedisCheckpointerOptions) {
    this.client = opts.client;
    this.prefix = opts.keyPrefix ?? 'ziro:cp';
    this.cap = opts.maxCheckpointsPerThread ?? 100;
    this.ttl = opts.ttlSeconds;
    this.now = opts.now ?? Date.now;
  }

  async put(threadId: string, snapshot: AgentSnapshot): Promise<CheckpointId> {
    const ts = this.now();
    const id = uuidv7(ts);
    const payload = JSON.stringify(snapshot);

    const idxKey = this.indexKey(threadId);
    const snapKey = this.snapshotKey(threadId, id);

    // 1. Write the snapshot payload.
    if (this.ttl !== undefined) {
      await this.client.command(['SET', snapKey, payload, 'EX', this.ttl]);
    } else {
      await this.client.command(['SET', snapKey, payload]);
    }
    // 2. Index it (score = ms ts so ZRANGEBYSCORE-by-time also works).
    await this.client.command(['ZADD', idxKey, ts, id]);
    if (this.ttl !== undefined) {
      await this.client.command(['EXPIRE', idxKey, this.ttl]);
    }

    // 3. Best-effort trim. Read current cardinality first to avoid the
    //    ZRANGE call entirely on the common case (under cap).
    if (Number.isFinite(this.cap)) {
      const card = await this.client.command<number>(['ZCARD', idxKey]);
      if (card > this.cap) {
        // Members ranked 0..(card-cap-1) are the oldest beyond the cap.
        const stop = card - this.cap - 1;
        const stale = await this.client.command<string[]>(['ZRANGE', idxKey, 0, stop]);
        if (stale.length > 0) {
          await this.client.command([
            'DEL',
            ...stale.map((sid) => this.snapshotKey(threadId, sid)),
          ]);
          await this.client.command(['ZREM', idxKey, ...stale]);
        }
      }
    }

    return id;
  }

  async get(threadId: string, checkpointId?: CheckpointId): Promise<AgentSnapshot | null> {
    if (checkpointId) {
      const raw = await this.client.command<string | null>([
        'GET',
        this.snapshotKey(threadId, checkpointId),
      ]);
      return raw ? (JSON.parse(raw) as AgentSnapshot) : null;
    }

    // Latest = highest-ranked element in the sorted set.
    const ids = await this.client.command<string[]>(['ZREVRANGE', this.indexKey(threadId), 0, 0]);
    const latestId = ids[0];
    if (!latestId) return null;

    const raw = await this.client.command<string | null>([
      'GET',
      this.snapshotKey(threadId, latestId),
    ]);
    return raw ? (JSON.parse(raw) as AgentSnapshot) : null;
  }

  async list(threadId: string, opts?: { limit?: number }): Promise<CheckpointMeta[]> {
    const limit = opts?.limit ?? this.cap;
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 1_000_000;
    if (safeLimit === 0) return [];

    // ZREVRANGE WITHSCORES yields a flat array [id, score, id, score, ...]
    const flat = await this.client.command<string[]>([
      'ZREVRANGE',
      this.indexKey(threadId),
      0,
      safeLimit - 1,
      'WITHSCORES',
    ]);
    if (flat.length === 0) return [];

    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      const id = flat[i];
      const scoreStr = flat[i + 1];
      if (id !== undefined && scoreStr !== undefined) {
        ids.push(id);
        scores.push(Number(scoreStr));
      }
    }
    if (ids.length === 0) return [];

    // MGET returns payloads in the same order as input keys.
    const payloads = await this.client.command<Array<string | null>>([
      'MGET',
      ...ids.map((id) => this.snapshotKey(threadId, id)),
    ]);

    const out: CheckpointMeta[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const payload = payloads[i];
      const score = scores[i];
      if (id === undefined || score === undefined) continue;
      // A missing payload (TTL expired / external delete) means the index
      // is stale; skip it rather than fabricate a fake meta entry.
      if (payload == null) continue;
      const snapshot = JSON.parse(payload) as AgentSnapshot;
      out.push({
        id,
        threadId,
        createdAt: new Date(score),
        agentSnapshotVersion: snapshot.version,
        sizeBytes: byteLength(payload),
      });
    }
    return out;
  }

  async delete(threadId: string, checkpointId?: CheckpointId): Promise<void> {
    const idxKey = this.indexKey(threadId);

    if (checkpointId) {
      await this.client.command(['DEL', this.snapshotKey(threadId, checkpointId)]);
      await this.client.command(['ZREM', idxKey, checkpointId]);
      return;
    }

    // Bulk delete: enumerate every id from the index, DEL their snapshot
    // keys, then DEL the index itself. Done in one ZRANGE so we never
    // KEYS-scan the entire keyspace.
    const allIds = await this.client.command<string[]>(['ZRANGE', idxKey, 0, -1]);
    if (allIds.length > 0) {
      await this.client.command(['DEL', ...allIds.map((id) => this.snapshotKey(threadId, id))]);
    }
    await this.client.command(['DEL', idxKey]);
  }

  private indexKey(threadId: string): string {
    return `${this.prefix}:idx:${threadId}`;
  }

  private snapshotKey(threadId: string, id: string): string {
    return `${this.prefix}:snap:${threadId}:${id}`;
  }
}

/**
 * Wrap an `ioredis` client into a {@link RedisLike}. The wrapper just
 * forwards `args[0]` as the command name and the rest as positional
 * arguments — `ioredis.call` accepts exactly that shape.
 *
 * Untyped on purpose so we don't import `ioredis`'s types.
 */
export function fromIoRedis(client: { call(...args: unknown[]): Promise<unknown> }): RedisLike {
  return {
    async command<T>(args: readonly (string | number)[]): Promise<T> {
      const [cmd, ...rest] = args;
      if (typeof cmd !== 'string') throw new Error('Redis command must be a string');
      return (await client.call(cmd, ...rest.map(String))) as T;
    },
  };
}

/**
 * Wrap a node-redis (v4+) client into a {@link RedisLike}. node-redis
 * exposes `sendCommand([cmd, ...args])` natively; we just stringify
 * numeric args.
 *
 * Untyped on purpose so we don't import the `redis` package's types.
 */
export function fromNodeRedis(client: {
  sendCommand(args: string[]): Promise<unknown>;
}): RedisLike {
  return {
    async command<T>(args: readonly (string | number)[]): Promise<T> {
      return (await client.sendCommand(args.map(String))) as T;
    },
  };
}

/** UTF-8 byte length without `Buffer` (works in non-Node runtimes too). */
function byteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
