import type { AgentSnapshot } from '@ziro-agent/agent';
import { describe, expect, it } from 'vitest';
import {
  ensureCheckpointsSchema,
  type PgQueryable,
  PostgresCheckpointer,
} from './postgres-checkpointer.js';

/**
 * Lightweight in-memory pg stub. We only emulate the four statement
 * shapes the adapter actually emits — adding a real `pg-mem` dep
 * would 5× the install size for tests that fundamentally just want
 * to verify SQL composition, parameter binding, and result-shape
 * mapping.
 */
function pgStub(): PgQueryable & {
  readonly rows: ReadonlyArray<StubRow>;
  readonly queries: ReadonlyArray<{ sql: string; params: readonly unknown[] }>;
} {
  const rows: StubRow[] = [];
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];

  const queryable: PgQueryable = {
    async query<R extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<{ rows: R[] }> {
      queries.push({ sql, params });

      // CREATE SCHEMA / CREATE TABLE / CREATE INDEX — accept and no-op.
      if (/^\s*CREATE\s+(SCHEMA|TABLE|INDEX)/i.test(sql)) {
        return { rows: [] };
      }

      // INSERT (with optional trim CTE)
      if (/INSERT INTO/.test(sql)) {
        const [threadId, checkpointId, payload, version, sizeBytes, cap] = params as [
          string,
          string,
          string,
          number,
          number,
          number | undefined,
        ];
        rows.push({
          thread_id: threadId,
          checkpoint_id: checkpointId,
          snapshot: JSON.parse(payload),
          version,
          size_bytes: sizeBytes,
          created_at: new Date(),
        });
        // Trim if cap provided (CTE form). Mirrors the adapter SQL
        // semantics: keep top-N by checkpoint_id DESC, drop the rest.
        if (cap !== undefined) {
          const survivors = rows
            .filter((r) => r.thread_id === threadId)
            .sort((a, b) => (a.checkpoint_id < b.checkpoint_id ? 1 : -1))
            .slice(0, cap);
          const survivorIds = new Set(survivors.map((r) => r.checkpoint_id));
          for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            if (r && r.thread_id === threadId && !survivorIds.has(r.checkpoint_id)) {
              rows.splice(i, 1);
            }
          }
        }
        return { rows: [] };
      }

      // SELECT ... LIMIT 1 (get)
      if (/SELECT snapshot/i.test(sql)) {
        const threadId = params[0] as string;
        const idFilter = params[1] as string | undefined;
        const matches = rows
          .filter((r) => r.thread_id === threadId && (!idFilter || r.checkpoint_id === idFilter))
          .sort((a, b) => (a.checkpoint_id < b.checkpoint_id ? 1 : -1));
        return matches[0]
          ? ({ rows: [{ snapshot: matches[0].snapshot }] } as unknown as { rows: R[] })
          : { rows: [] };
      }

      // SELECT checkpoint_id, created_at... (list)
      if (/SELECT checkpoint_id/i.test(sql)) {
        const threadId = params[0] as string;
        const limit = params[1] as number;
        const matches = rows
          .filter((r) => r.thread_id === threadId)
          .sort((a, b) => (a.checkpoint_id < b.checkpoint_id ? 1 : -1))
          .slice(0, limit);
        return {
          rows: matches.map((r) => ({
            checkpoint_id: r.checkpoint_id,
            created_at: r.created_at,
            version: r.version,
            size_bytes: r.size_bytes,
          })) as unknown as R[],
        };
      }

      // DELETE
      if (/^\s*DELETE FROM/i.test(sql)) {
        const threadId = params[0] as string;
        const idFilter = params[1] as string | undefined;
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i];
          if (r && r.thread_id === threadId && (!idFilter || r.checkpoint_id === idFilter)) {
            rows.splice(i, 1);
          }
        }
        return { rows: [] };
      }

      throw new Error(`pgStub: unrecognised SQL\n${sql}`);
    },
  };

  return Object.assign(queryable, { rows, queries });
}

interface StubRow {
  thread_id: string;
  checkpoint_id: string;
  snapshot: AgentSnapshot;
  version: number;
  size_bytes: number;
  created_at: Date;
}

const baseSnapshot = (overrides: Partial<AgentSnapshot> = {}): AgentSnapshot =>
  ({
    version: 2,
    messages: [{ role: 'user', content: 'hi' }],
    steps: [],
    pendingApprovals: [],
    resolvedSiblings: [],
    nextStepIndex: 1,
    totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    ...overrides,
  }) as AgentSnapshot;

describe('PostgresCheckpointer', () => {
  it('put → get round-trips a snapshot under the latest-by-default contract', async () => {
    const pool = pgStub();
    const cp = new PostgresCheckpointer({ pool });
    const snap = baseSnapshot();

    const id = await cp.put('thread-A', snap);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const fetched = await cp.get('thread-A');
    expect(fetched).toEqual(snap);
  });

  it('get(threadId) returns the most recent checkpoint when several exist', async () => {
    const pool = pgStub();
    let clock = 1_000_000_000_000;
    const cp = new PostgresCheckpointer({ pool, now: () => clock });

    await cp.put('t', baseSnapshot({ messages: [{ role: 'user', content: 'first' }] }));
    clock += 1; // ensure UUID v7 ordering
    await cp.put('t', baseSnapshot({ messages: [{ role: 'user', content: 'second' }] }));

    const latest = await cp.get('t');
    expect(latest?.messages?.[0]?.content).toBe('second');
  });

  it('get(threadId, id) returns that specific snapshot or null', async () => {
    const pool = pgStub();
    const cp = new PostgresCheckpointer({ pool });

    const id1 = await cp.put('t', baseSnapshot({ messages: [{ role: 'user', content: '1' }] }));
    await cp.put('t', baseSnapshot({ messages: [{ role: 'user', content: '2' }] }));

    const direct = await cp.get('t', id1);
    expect(direct?.messages?.[0]?.content).toBe('1');

    const missing = await cp.get('t', 'unknown-id');
    expect(missing).toBeNull();
  });

  it('list returns metadata newest-first with the right shape', async () => {
    const pool = pgStub();
    let clock = 1_000_000_000_000;
    const cp = new PostgresCheckpointer({ pool, now: () => clock });

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await cp.put('t', baseSnapshot()));
      clock += 1;
    }

    const metas = await cp.list('t');
    expect(metas.map((m) => m.id)).toEqual([...ids].reverse());
    expect(metas[0]).toMatchObject({
      threadId: 't',
      agentSnapshotVersion: 2,
    });
    expect(typeof metas[0]?.sizeBytes).toBe('number');
    expect(metas[0]?.sizeBytes).toBeGreaterThan(0);
    expect(metas[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('list({ limit }) honours the cap', async () => {
    const pool = pgStub();
    let clock = 1_000_000_000_000;
    const cp = new PostgresCheckpointer({ pool, now: () => clock });

    for (let i = 0; i < 5; i++) {
      await cp.put('t', baseSnapshot());
      clock += 1;
    }

    expect(await cp.list('t', { limit: 2 })).toHaveLength(2);
    expect(await cp.list('t', { limit: 0 })).toHaveLength(0);
  });

  it('delete(threadId) removes every checkpoint for that thread', async () => {
    const pool = pgStub();
    const cp = new PostgresCheckpointer({ pool });

    await cp.put('a', baseSnapshot());
    await cp.put('a', baseSnapshot());
    await cp.put('b', baseSnapshot());

    await cp.delete('a');
    expect(await cp.list('a')).toHaveLength(0);
    expect(await cp.list('b')).toHaveLength(1);
  });

  it('delete(threadId, id) removes only that checkpoint', async () => {
    const pool = pgStub();
    const cp = new PostgresCheckpointer({ pool });

    const id1 = await cp.put('t', baseSnapshot());
    const id2 = await cp.put('t', baseSnapshot());

    await cp.delete('t', id1);
    const survivors = await cp.list('t');
    expect(survivors.map((m) => m.id)).toEqual([id2]);
  });

  it('maxCheckpointsPerThread trims the oldest in the same put', async () => {
    const pool = pgStub();
    let clock = 1_000_000_000_000;
    const cp = new PostgresCheckpointer({
      pool,
      maxCheckpointsPerThread: 3,
      now: () => clock,
    });

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await cp.put('t', baseSnapshot()));
      clock += 1;
    }

    const metas = await cp.list('t');
    expect(metas).toHaveLength(3);
    // Survivors are the THREE newest by UUID v7 (lex DESC).
    expect(metas.map((m) => m.id)).toEqual(ids.slice(-3).reverse());
  });

  it('maxCheckpointsPerThread = Infinity disables trimming', async () => {
    const pool = pgStub();
    const cp = new PostgresCheckpointer({ pool, maxCheckpointsPerThread: Infinity });
    for (let i = 0; i < 50; i++) await cp.put('t', baseSnapshot());
    expect(await cp.list('t', { limit: 100 })).toHaveLength(50);
  });

  it('rejects identifiers that are not [a-zA-Z_][a-zA-Z0-9_]*', () => {
    const pool = pgStub();
    expect(() => new PostgresCheckpointer({ pool, table: 'evil"; DROP TABLE users--' })).toThrow(
      /Invalid Postgres identifier/,
    );
    expect(() => new PostgresCheckpointer({ pool, schema: 'public; --' })).toThrow(
      /Invalid Postgres identifier/,
    );
  });

  it('quotes the configured schema + table in every emitted statement', async () => {
    const pool = pgStub();
    const cp = new PostgresCheckpointer({
      pool,
      schema: 'agents_app',
      table: 'snapshots',
    });
    await cp.put('t', baseSnapshot());
    await cp.get('t');
    await cp.list('t');
    await cp.delete('t');
    for (const q of pool.queries) {
      expect(q.sql).toContain('"agents_app"."snapshots"');
    }
  });

  it('coerces a raw JSON string from the driver back into an AgentSnapshot', async () => {
    // Some lower-level drivers / pooled adapters return JSONB as a
    // raw string — verify the adapter parses it transparently.
    const snap = baseSnapshot();
    const stringDriver: PgQueryable = {
      async query() {
        return { rows: [{ snapshot: JSON.stringify(snap) }] as never };
      },
    };
    const cp = new PostgresCheckpointer({ pool: stringDriver });
    const result = await cp.get('t');
    expect(result).toEqual(snap);
  });
});

describe('ensureCheckpointsSchema', () => {
  it('issues CREATE SCHEMA / CREATE TABLE / CREATE INDEX with quoted identifiers', async () => {
    const pool = pgStub();
    await ensureCheckpointsSchema(pool, { schema: 'myapp', table: 'cp' });

    const sqls = pool.queries.map((q) => q.sql);
    expect(sqls.some((s) => /CREATE SCHEMA IF NOT EXISTS "myapp"/.test(s))).toBe(true);
    expect(sqls.some((s) => /CREATE TABLE IF NOT EXISTS "myapp"\."cp"/.test(s))).toBe(true);
    expect(sqls.some((s) => /CREATE INDEX IF NOT EXISTS "cp_thread_idx"/.test(s))).toBe(true);
  });

  it('defaults to public.ziro_checkpoints', async () => {
    const pool = pgStub();
    await ensureCheckpointsSchema(pool);
    const joined = pool.queries.map((q) => q.sql).join('\n');
    expect(joined).toContain('"public"."ziro_checkpoints"');
  });
});
