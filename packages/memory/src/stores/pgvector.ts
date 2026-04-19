import { uuid } from '../util/uuid.js';
import type {
  Document,
  EmbeddedDocument,
  EmbeddingModel,
  Metadata,
  SearchResult,
  VectorQuery,
  VectorStore,
} from '../types.js';

/**
 * Minimal subset of `node-postgres` we rely on. Declared inline so we don't
 * need a hard dependency on `pg` types — the user supplies a real `Pool` /
 * `Client` instance at runtime.
 */
export interface PgPoolLike {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PgVectorStoreOptions {
  pool: PgPoolLike;
  /** Table name. Default `ziro_documents`. */
  table?: string;
  /** Vector dimensions. Required — pgvector columns are fixed-width. */
  dimensions: number;
  embedder?: EmbeddingModel;
  /**
   * Distance operator used for similarity ranking. Defaults to cosine
   * distance (`<=>`) which matches the rest of the SDK. Use `<#>` for inner
   * product or `<->` for L2 if you have indexed your column accordingly.
   */
  distance?: '<=>' | '<#>' | '<->';
}

/**
 * Postgres + `pgvector` adapter implementing {@link VectorStore}.
 *
 * Schema (created by {@link PgVectorStore.init}):
 * ```sql
 * CREATE EXTENSION IF NOT EXISTS vector;
 * CREATE TABLE IF NOT EXISTS <table> (
 *   id        TEXT PRIMARY KEY,
 *   text      TEXT NOT NULL,
 *   embedding vector(<dim>) NOT NULL,
 *   metadata  JSONB
 * );
 * CREATE INDEX IF NOT EXISTS <table>_embedding_ivfflat
 *   ON <table> USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
 * ```
 */
export class PgVectorStore implements VectorStore {
  private readonly pool: PgPoolLike;
  private readonly table: string;
  private readonly dim: number;
  private readonly embedder?: EmbeddingModel;
  private readonly distance: '<=>' | '<#>' | '<->';

  constructor(options: PgVectorStoreOptions) {
    this.pool = options.pool;
    this.table = sanitizeIdent(options.table ?? 'ziro_documents');
    this.dim = options.dimensions;
    if (options.embedder) this.embedder = options.embedder;
    this.distance = options.distance ?? '<=>';
  }

  /** Ensure the extension, table, and ivfflat index exist. Safe to call repeatedly. */
  async init(): Promise<void> {
    await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.table} (
        id        TEXT PRIMARY KEY,
        text      TEXT NOT NULL,
        embedding vector(${this.dim}) NOT NULL,
        metadata  JSONB
      )`,
    );
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_embedding_ivfflat
        ON ${this.table} USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`,
    );
  }

  async upsert(docs: EmbeddedDocument[]): Promise<void> {
    if (docs.length === 0) return;
    for (const d of docs) {
      if (d.embedding.length !== this.dim) {
        throw new Error(
          `PgVectorStore: vector dim mismatch (${d.embedding.length} vs expected ${this.dim})`,
        );
      }
      await this.pool.query(
        `INSERT INTO ${this.table} (id, text, embedding, metadata)
         VALUES ($1, $2, $3::vector, $4)
         ON CONFLICT (id) DO UPDATE SET
           text = EXCLUDED.text,
           embedding = EXCLUDED.embedding,
           metadata = EXCLUDED.metadata`,
        [d.id, d.text, toVectorLiteral(d.embedding), d.metadata ?? null],
      );
    }
  }

  async add(docs: Document[]): Promise<void> {
    if (!this.embedder) {
      throw new Error('PgVectorStore.add: no embedder configured.');
    }
    const embeddings = await this.embedder.embed(docs.map((d) => d.text));
    const embedded: EmbeddedDocument[] = docs.map((d, i) => {
      const out: EmbeddedDocument = {
        id: d.id ?? uuid(),
        text: d.text,
        embedding: embeddings[i] as number[],
      };
      if (d.metadata !== undefined) out.metadata = d.metadata;
      return out;
    });
    await this.upsert(embedded);
  }

  async search(query: VectorQuery): Promise<SearchResult[]> {
    const topK = query.topK ?? 4;
    const vector = await this.resolveQueryVector(query);

    const params: unknown[] = [toVectorLiteral(vector), topK];
    let where = '';
    if (query.filter && Object.keys(query.filter).length > 0) {
      params.push(query.filter);
      where = `WHERE metadata @> $${params.length}::jsonb`;
    }

    // Cosine *distance* is in [0, 2]; we convert to similarity in [-1, 1].
    const sim =
      this.distance === '<=>'
        ? `1 - (embedding ${this.distance} $1::vector)`
        : this.distance === '<#>'
          ? `-(embedding ${this.distance} $1::vector)`
          : `-(embedding ${this.distance} $1::vector)`;

    const sql = `SELECT id, text, metadata, ${sim} AS score
      FROM ${this.table}
      ${where}
      ORDER BY embedding ${this.distance} $1::vector
      LIMIT $2`;
    const { rows } = await this.pool.query<{
      id: string;
      text: string;
      metadata: Metadata | null;
      score: string | number;
    }>(sql, params);

    const minScore = query.minScore ?? -Infinity;
    const out: SearchResult[] = [];
    for (const r of rows) {
      const score = typeof r.score === 'string' ? Number.parseFloat(r.score) : r.score;
      if (score < minScore) continue;
      const hit: SearchResult = { id: r.id, text: r.text, score };
      if (r.metadata) hit.metadata = r.metadata;
      out.push(hit);
    }
    return out;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.pool.query(`DELETE FROM ${this.table} WHERE id = ANY($1::text[])`, [ids]);
  }

  async clear(): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.table}`);
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.table}`,
    );
    const first = rows[0];
    return first ? Number.parseInt(first.count, 10) : 0;
  }

  private async resolveQueryVector(query: VectorQuery): Promise<number[]> {
    if (query.embedding) return query.embedding;
    if (query.text) {
      if (!this.embedder) {
        throw new Error('PgVectorStore.search: query.text requires an embedder.');
      }
      const [v] = await this.embedder.embed([query.text]);
      return v as number[];
    }
    throw new Error('PgVectorStore.search: query must have `embedding` or `text`.');
  }
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

/**
 * Allow only `[A-Za-z_][A-Za-z0-9_]*` identifiers. We interpolate the table
 * name into raw SQL so this is required for safety; pg doesn't bind identifiers.
 */
function sanitizeIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
}
