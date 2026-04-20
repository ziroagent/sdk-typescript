import type { AgentSnapshot, Checkpointer, CheckpointId, CheckpointMeta } from '@ziro-agent/agent';
import { uuidv7 } from './uuid7.js';

/**
 * Minimal subset of `pg.Pool` we depend on. Typed structurally so
 * callers can pass:
 *
 *  - a real `pg.Pool` (production)
 *  - a `pg.PoolClient` from `pool.connect()` if they want to bind to a
 *    single connection (tests, transactions)
 *  - any custom queryable matching the shape (`postgres.js`'s `Sql`
 *    template-tag wrapped in an adapter, an in-memory mock, etc.)
 *
 * The structural typing is the whole reason `pg` is a `peerDependency`
 * not a `dependency` — consumers bring their own driver and we never
 * pin a major version they're trying to deploy.
 */
export interface PgQueryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
}

export interface PostgresCheckpointerOptions {
  /**
   * Postgres pool / queryable used for every statement. Pass a
   * `pg.Pool` for production; pass a stub conforming to
   * {@link PgQueryable} for tests.
   */
  pool: PgQueryable;
  /**
   * Schema-qualified table name. Defaults to `public.ziro_checkpoints`.
   *
   * The table is NOT created automatically — call
   * {@link ensureCheckpointsSchema} once at boot, or run the SQL in
   * the README manually as a migration. Implicit DDL on hot paths is
   * a footgun in production deploys.
   */
  schema?: string;
  table?: string;
  /**
   * Hard cap on retained checkpoints per `threadId`. When exceeded
   * the oldest checkpoints are deleted in the same transaction as
   * `put`, keeping write amplification predictable.
   *
   * Default `100` (matches the in-memory adapter). Pass `Infinity`
   * to disable trimming.
   */
  maxCheckpointsPerThread?: number;
  /** Override for tests / determinism. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Production-grade {@link Checkpointer} backed by Postgres. Designed
 * for multi-process deployments where durability across crashes is
 * required.
 *
 * Schema (created by {@link ensureCheckpointsSchema}):
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS public.ziro_checkpoints (
 *   thread_id     TEXT NOT NULL,
 *   checkpoint_id TEXT NOT NULL,
 *   snapshot      JSONB NOT NULL,
 *   version       INTEGER NOT NULL,
 *   size_bytes    INTEGER NOT NULL,
 *   created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   PRIMARY KEY (thread_id, checkpoint_id)
 * );
 * CREATE INDEX IF NOT EXISTS ziro_checkpoints_thread_idx
 *   ON public.ziro_checkpoints (thread_id, checkpoint_id DESC);
 * ```
 *
 * Concurrency: `put` is atomic per `(thread_id, checkpoint_id)`
 * (PRIMARY KEY enforces it). UUID v7 ids are generated client-side
 * so two concurrent writes to the same thread never collide. The
 * trim-on-cap pass runs in the same transaction as the insert so a
 * crash mid-trim leaves a consistent state, never a torn cap.
 *
 * Per RFC 0006 §adapters; ships in v0.2.
 */
export class PostgresCheckpointer implements Checkpointer {
  private readonly pool: PgQueryable;
  private readonly qualified: string;
  private readonly cap: number;
  private readonly now: () => number;

  constructor(opts: PostgresCheckpointerOptions) {
    this.pool = opts.pool;
    const schema = opts.schema ?? 'public';
    const table = opts.table ?? 'ziro_checkpoints';
    this.qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    this.cap = opts.maxCheckpointsPerThread ?? 100;
    this.now = opts.now ?? Date.now;
  }

  async put(threadId: string, snapshot: AgentSnapshot): Promise<CheckpointId> {
    const id = uuidv7(this.now());
    const payload = JSON.stringify(snapshot);
    const sizeBytes = byteLength(payload);

    // Single round-trip: INSERT + (optional) trim. We use a CTE so
    // the trim only runs when finite cap was set; for Infinity the
    // adapter omits the trim CTE entirely.
    if (Number.isFinite(this.cap)) {
      await this.pool.query(
        `WITH inserted AS (
           INSERT INTO ${this.qualified}
             (thread_id, checkpoint_id, snapshot, version, size_bytes)
           VALUES ($1, $2, $3::jsonb, $4, $5)
           RETURNING checkpoint_id
         ),
         survivors AS (
           SELECT checkpoint_id
             FROM ${this.qualified}
            WHERE thread_id = $1
            ORDER BY checkpoint_id DESC
            LIMIT $6
         )
         DELETE FROM ${this.qualified}
          WHERE thread_id = $1
            AND checkpoint_id NOT IN (SELECT checkpoint_id FROM survivors)`,
        [threadId, id, payload, snapshot.version, sizeBytes, this.cap],
      );
    } else {
      await this.pool.query(
        `INSERT INTO ${this.qualified}
           (thread_id, checkpoint_id, snapshot, version, size_bytes)
         VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [threadId, id, payload, snapshot.version, sizeBytes],
      );
    }

    return id;
  }

  async get(threadId: string, checkpointId?: CheckpointId): Promise<AgentSnapshot | null> {
    if (checkpointId) {
      const result = await this.pool.query<{ snapshot: AgentSnapshot }>(
        `SELECT snapshot
           FROM ${this.qualified}
          WHERE thread_id = $1 AND checkpoint_id = $2
          LIMIT 1`,
        [threadId, checkpointId],
      );
      const row = result.rows[0];
      return row ? coerceSnapshot(row.snapshot) : null;
    }
    const result = await this.pool.query<{ snapshot: AgentSnapshot }>(
      `SELECT snapshot
         FROM ${this.qualified}
        WHERE thread_id = $1
        ORDER BY checkpoint_id DESC
        LIMIT 1`,
      [threadId],
    );
    const row = result.rows[0];
    return row ? coerceSnapshot(row.snapshot) : null;
  }

  async list(threadId: string, opts?: { limit?: number }): Promise<CheckpointMeta[]> {
    const limit = opts?.limit ?? this.cap;
    const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 1_000_000;
    if (safeLimit === 0) return [];

    const result = await this.pool.query<{
      checkpoint_id: string;
      created_at: Date | string;
      version: number;
      size_bytes: number;
    }>(
      `SELECT checkpoint_id, created_at, version, size_bytes
         FROM ${this.qualified}
        WHERE thread_id = $1
        ORDER BY checkpoint_id DESC
        LIMIT $2`,
      [threadId, safeLimit],
    );

    return result.rows.map((r) => ({
      id: r.checkpoint_id,
      threadId,
      createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
      agentSnapshotVersion: r.version,
      sizeBytes: r.size_bytes,
    }));
  }

  async delete(threadId: string, checkpointId?: CheckpointId): Promise<void> {
    if (checkpointId) {
      await this.pool.query(
        `DELETE FROM ${this.qualified} WHERE thread_id = $1 AND checkpoint_id = $2`,
        [threadId, checkpointId],
      );
      return;
    }
    await this.pool.query(`DELETE FROM ${this.qualified} WHERE thread_id = $1`, [threadId]);
  }
}

/**
 * Idempotent DDL helper. Run once at boot — or, better, copy the SQL
 * from this function into your real migration tool (Flyway, Atlas,
 * Prisma migrate, drizzle-kit). Implicit DDL inside the request path
 * is a footgun in multi-process deploys.
 */
export async function ensureCheckpointsSchema(
  pool: PgQueryable,
  options: { schema?: string; table?: string } = {},
): Promise<void> {
  const schema = options.schema ?? 'public';
  const table = options.table ?? 'ziro_checkpoints';
  const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`;
  const indexName = quoteIdent(`${table}_thread_idx`);

  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)}`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${qualified} (
       thread_id     TEXT NOT NULL,
       checkpoint_id TEXT NOT NULL,
       snapshot      JSONB NOT NULL,
       version       INTEGER NOT NULL,
       size_bytes    INTEGER NOT NULL,
       created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (thread_id, checkpoint_id)
     )`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS ${indexName}
       ON ${qualified} (thread_id, checkpoint_id DESC)`,
  );
}

/**
 * Quote an identifier for safe SQL interpolation. We only allow
 * `[a-zA-Z0-9_]+`; anything else throws — this stays well clear of
 * the "Postgres allows arbitrary identifiers if you double-quote
 * everything" footgun while keeping the helper readable.
 */
function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid Postgres identifier ${JSON.stringify(name)}. ` +
        `Allowed characters: [a-zA-Z_][a-zA-Z0-9_]*.`,
    );
  }
  return `"${name}"`;
}

/**
 * `pg` returns `JSONB` columns already JSON-parsed via its row-mapping
 * layer. Some lower-level drivers / mocks may pass a raw string; this
 * helper handles both shapes so test stubs and real `pg` consumers
 * behave identically.
 */
function coerceSnapshot(value: unknown): AgentSnapshot {
  if (typeof value === 'string') {
    return JSON.parse(value) as AgentSnapshot;
  }
  return value as AgentSnapshot;
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
