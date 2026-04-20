import type { AgentSnapshot } from '@ziro-agent/agent';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RedisCheckpointer, type RedisLike } from './redis-checkpointer.js';

/**
 * In-memory Redis stub. Implements only the subset of commands the
 * adapter actually issues, returning replies in the exact wire shape
 * `RedisLike` documents (`string | null`, `string[]`, `number`, `'OK'`).
 *
 * Sorted sets are represented as `Map<member, score>`; ordering at
 * read time is computed on demand via `Array.sort`. Good enough — the
 * cap is 100 by default.
 */
function redisStub(): RedisLike & {
  inspect(): { strings: Map<string, string>; zsets: Map<string, Map<string, number>> };
  calls: string[][];
} {
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const ttls = new Map<string, number>();
  const calls: string[][] = [];

  const ensureZset = (k: string) => {
    let z = zsets.get(k);
    if (!z) {
      z = new Map();
      zsets.set(k, z);
    }
    return z;
  };

  const sortedAsc = (z: Map<string, number>) =>
    [...z.entries()].sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });

  return {
    inspect() {
      return { strings, zsets };
    },
    calls,
    async command<T>(args: readonly (string | number)[]): Promise<T> {
      const cmd = String(args[0]).toUpperCase();
      const rest = args.slice(1).map(String);
      calls.push([cmd, ...rest]);

      switch (cmd) {
        case 'SET': {
          const [k, v, exFlag, exVal] = rest;
          if (k === undefined || v === undefined) throw new Error('SET requires key + value');
          strings.set(k, v);
          if (exFlag?.toUpperCase() === 'EX' && exVal !== undefined) {
            ttls.set(k, Number(exVal));
          }
          return 'OK' as T;
        }
        case 'GET': {
          const [k] = rest;
          if (k === undefined) throw new Error('GET requires key');
          return (strings.get(k) ?? null) as T;
        }
        case 'MGET': {
          return rest.map((k) => strings.get(k) ?? null) as unknown as T;
        }
        case 'DEL': {
          let n = 0;
          for (const k of rest) {
            if (strings.delete(k)) n++;
            if (zsets.delete(k)) n++;
            ttls.delete(k);
          }
          return n as unknown as T;
        }
        case 'EXPIRE': {
          const [k, secs] = rest;
          if (k === undefined || secs === undefined) throw new Error('EXPIRE requires key + secs');
          if (strings.has(k) || zsets.has(k)) {
            ttls.set(k, Number(secs));
            return 1 as unknown as T;
          }
          return 0 as unknown as T;
        }
        case 'ZADD': {
          const [k, score, member] = rest;
          if (k === undefined || score === undefined || member === undefined) {
            throw new Error('ZADD requires key + score + member');
          }
          const z = ensureZset(k);
          const isNew = !z.has(member);
          z.set(member, Number(score));
          return (isNew ? 1 : 0) as unknown as T;
        }
        case 'ZCARD': {
          const [k] = rest;
          if (k === undefined) throw new Error('ZCARD requires key');
          return (zsets.get(k)?.size ?? 0) as unknown as T;
        }
        case 'ZRANGE': {
          const [k, startStr, stopStr, withScores] = rest;
          if (k === undefined || startStr === undefined || stopStr === undefined) {
            throw new Error('ZRANGE requires key + start + stop');
          }
          const z = zsets.get(k);
          if (!z) return [] as unknown as T;
          const sorted = sortedAsc(z);
          const start = Number(startStr);
          const stop = Number(stopStr);
          const realStart = start < 0 ? Math.max(0, sorted.length + start) : start;
          const realStop = stop < 0 ? sorted.length + stop : stop;
          const slice = sorted.slice(realStart, realStop + 1);
          if (withScores?.toUpperCase() === 'WITHSCORES') {
            return slice.flatMap(([m, s]) => [m, String(s)]) as unknown as T;
          }
          return slice.map(([m]) => m) as unknown as T;
        }
        case 'ZREVRANGE': {
          const [k, startStr, stopStr, withScores] = rest;
          if (k === undefined || startStr === undefined || stopStr === undefined) {
            throw new Error('ZREVRANGE requires key + start + stop');
          }
          const z = zsets.get(k);
          if (!z) return [] as unknown as T;
          const sorted = sortedAsc(z).reverse();
          const start = Number(startStr);
          const stop = Number(stopStr);
          const realStart = start < 0 ? Math.max(0, sorted.length + start) : start;
          const realStop = stop < 0 ? sorted.length + stop : stop;
          const slice = sorted.slice(realStart, realStop + 1);
          if (withScores?.toUpperCase() === 'WITHSCORES') {
            return slice.flatMap(([m, s]) => [m, String(s)]) as unknown as T;
          }
          return slice.map(([m]) => m) as unknown as T;
        }
        case 'ZREM': {
          const [k, ...members] = rest;
          if (k === undefined) throw new Error('ZREM requires key');
          const z = zsets.get(k);
          if (!z) return 0 as unknown as T;
          let n = 0;
          for (const m of members) if (z.delete(m)) n++;
          return n as unknown as T;
        }
        default:
          throw new Error(`redisStub: unimplemented command "${cmd}"`);
      }
    },
  };
}

const snap = (overrides: Partial<AgentSnapshot> = {}): AgentSnapshot => ({
  version: 2,
  agentId: 'a1',
  threadId: 't1',
  step: 0,
  messages: [],
  pendingApprovals: [],
  metadata: {},
  budget: undefined,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('RedisCheckpointer', () => {
  let stub: ReturnType<typeof redisStub>;
  let cp: RedisCheckpointer;
  let timeCursor: number;

  beforeEach(() => {
    stub = redisStub();
    timeCursor = 1_700_000_000_000;
    cp = new RedisCheckpointer({
      client: stub,
      now: () => timeCursor++,
    });
  });

  afterEach(() => {
    // No teardown needed; new stub per test.
  });

  describe('put / get', () => {
    it('returns a UUID v7 id and round-trips via get(threadId)', async () => {
      const id = await cp.put('thread-1', snap({ step: 7 }));
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      const got = await cp.get('thread-1');
      expect(got?.step).toBe(7);
    });

    it('get(threadId, id) reads the specific checkpoint', async () => {
      const id1 = await cp.put('t', snap({ step: 1 }));
      await cp.put('t', snap({ step: 2 }));
      await cp.put('t', snap({ step: 3 }));

      expect((await cp.get('t', id1))?.step).toBe(1);
      expect((await cp.get('t'))?.step).toBe(3);
    });

    it('returns null for missing threads / ids', async () => {
      expect(await cp.get('absent')).toBeNull();
      expect(await cp.get('absent', '00000000-0000-7000-8000-000000000000')).toBeNull();
    });

    it('isolates threads', async () => {
      await cp.put('t1', snap({ step: 10 }));
      await cp.put('t2', snap({ step: 20 }));
      expect((await cp.get('t1'))?.step).toBe(10);
      expect((await cp.get('t2'))?.step).toBe(20);
    });
  });

  describe('list', () => {
    it('returns checkpoints newest-first with size + version metadata', async () => {
      await cp.put('t', snap({ step: 1 }));
      await cp.put('t', snap({ step: 2 }));
      await cp.put('t', snap({ step: 3 }));

      const meta = await cp.list('t');
      expect(meta).toHaveLength(3);
      expect(meta.map((m) => m.threadId)).toEqual(['t', 't', 't']);
      // Newest first.
      expect(meta[0]?.createdAt.getTime()).toBeGreaterThan(meta[2]?.createdAt.getTime() ?? 0);
      // Snapshot version stamped.
      expect(meta[0]?.agentSnapshotVersion).toBe(2);
      // size_bytes derived from JSON payload.
      expect(meta[0]?.sizeBytes).toBeGreaterThan(0);
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) await cp.put('t', snap({ step: i }));
      const meta = await cp.list('t', { limit: 2 });
      expect(meta).toHaveLength(2);
    });

    it('returns [] for absent threads', async () => {
      expect(await cp.list('absent')).toEqual([]);
    });

    it('skips index entries whose payload is missing (stale TTL eviction)', async () => {
      await cp.put('t', snap({ step: 1 }));
      const id2 = await cp.put('t', snap({ step: 2 }));
      // Simulate Redis evicting the payload but the index lingering.
      stub.inspect().strings.delete(`ziro:cp:snap:t:${id2}`);

      const meta = await cp.list('t');
      // The stale index entry must be skipped, not synthesised.
      expect(meta).toHaveLength(1);
      expect(meta[0]?.agentSnapshotVersion).toBe(2);
    });
  });

  describe('cap (maxCheckpointsPerThread)', () => {
    it('trims the oldest checkpoints when cap exceeded', async () => {
      const trimCp = new RedisCheckpointer({
        client: stub,
        maxCheckpointsPerThread: 3,
        now: () => timeCursor++,
      });

      const ids: string[] = [];
      for (let i = 0; i < 6; i++) ids.push(await trimCp.put('t', snap({ step: i })));

      // Only the 3 newest should remain in the index.
      const remaining = await trimCp.list('t');
      expect(remaining).toHaveLength(3);
      // First three ids should be gone from the snapshot keyspace.
      const strings = stub.inspect().strings;
      expect(strings.has(`ziro:cp:snap:t:${ids[0]}`)).toBe(false);
      expect(strings.has(`ziro:cp:snap:t:${ids[1]}`)).toBe(false);
      expect(strings.has(`ziro:cp:snap:t:${ids[2]}`)).toBe(false);
      // Last three ids should still be there.
      expect(strings.has(`ziro:cp:snap:t:${ids[3]}`)).toBe(true);
      expect(strings.has(`ziro:cp:snap:t:${ids[5]}`)).toBe(true);
    });

    it('cap=Infinity disables trimming entirely', async () => {
      const inf = new RedisCheckpointer({
        client: stub,
        maxCheckpointsPerThread: Number.POSITIVE_INFINITY,
        now: () => timeCursor++,
      });
      for (let i = 0; i < 12; i++) await inf.put('t', snap({ step: i }));
      const meta = await inf.list('t', { limit: 100 });
      expect(meta).toHaveLength(12);
      // ZRANGE / DEL on snapshot keys for trim must NOT have run.
      const trimRanges = stub.calls.filter(
        (c) => c[0] === 'ZRANGE' && c[1]?.startsWith('ziro:cp:idx:'),
      );
      expect(trimRanges).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes a single checkpoint by id', async () => {
      const id = await cp.put('t', snap({ step: 1 }));
      await cp.put('t', snap({ step: 2 }));
      await cp.delete('t', id);
      const meta = await cp.list('t');
      expect(meta).toHaveLength(1);
      expect(meta[0]?.id).not.toBe(id);
    });

    it('deletes every checkpoint for a thread', async () => {
      for (let i = 0; i < 3; i++) await cp.put('t', snap({ step: i }));
      await cp.delete('t');
      expect(await cp.list('t')).toEqual([]);
      expect(await cp.get('t')).toBeNull();
      // Both index AND snapshot keys must be gone.
      const strings = stub.inspect().strings;
      const zsets = stub.inspect().zsets;
      expect([...strings.keys()].some((k) => k.startsWith('ziro:cp:snap:t:'))).toBe(false);
      expect(zsets.has('ziro:cp:idx:t')).toBe(false);
    });

    it('is a no-op for absent threads', async () => {
      await expect(cp.delete('ghost')).resolves.toBeUndefined();
      await expect(cp.delete('ghost', 'no-such-id')).resolves.toBeUndefined();
    });
  });

  describe('TTL', () => {
    it('issues SET ... EX <ttl> when ttlSeconds is configured', async () => {
      const ttlCp = new RedisCheckpointer({
        client: stub,
        ttlSeconds: 3600,
        now: () => timeCursor++,
      });
      await ttlCp.put('t', snap());
      const setCall = stub.calls.find((c) => c[0] === 'SET');
      expect(setCall?.[3]).toBe('EX');
      expect(setCall?.[4]).toBe('3600');
      const expireCall = stub.calls.find((c) => c[0] === 'EXPIRE');
      expect(expireCall?.[1]).toBe('ziro:cp:idx:t');
      expect(expireCall?.[2]).toBe('3600');
    });

    it('omits EX when no ttl configured', async () => {
      await cp.put('t', snap());
      const setCall = stub.calls.find((c) => c[0] === 'SET');
      expect(setCall).toBeDefined();
      expect(setCall?.[3]).toBeUndefined();
      expect(stub.calls.some((c) => c[0] === 'EXPIRE')).toBe(false);
    });
  });

  describe('keyPrefix', () => {
    it('honours custom keyPrefix', async () => {
      const custom = new RedisCheckpointer({
        client: stub,
        keyPrefix: 'myapp:agent',
        now: () => timeCursor++,
      });
      await custom.put('t', snap());
      const strings = stub.inspect().strings;
      expect([...strings.keys()].every((k) => k.startsWith('myapp:agent:snap:'))).toBe(true);
      expect(stub.inspect().zsets.has('myapp:agent:idx:t')).toBe(true);
    });
  });
});
