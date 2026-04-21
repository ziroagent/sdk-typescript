import { reciprocalRankFusion } from '../rrf.js';
import type {
  Document,
  EmbeddedDocument,
  EmbeddingModel,
  Metadata,
  SearchResult,
  SearchStrategy,
  VectorQuery,
  VectorStore,
} from '../types.js';
import { uuid } from '../util/uuid.js';

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
  /**
   * When `VectorQuery.strategy` is omitted, use this strategy. `hybrid`
   * requires non-empty `query.text` (lexical channel uses Postgres FTS).
   */
  defaultSearchStrategy?: SearchStrategy;
}

interface FtsRow {
  id: string;
  text: string;
  metadata: Metadata | null;
  fts_score: string | number;
  semantic_score: string | number;
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
 * CREATE INDEX IF NOT EXISTS <table>_fts
 *   ON <table> USING gin (to_tsvector('english', text));
 * ```
 */
export class PgVectorStore implements VectorStore {
  private readonly pool: PgPoolLike;
  private readonly table: string;
  private readonly dim: number;
  private readonly embedder?: EmbeddingModel;
  private readonly distance: '<=>' | '<#>' | '<->';
  private readonly defaultSearchStrategy: SearchStrategy | undefined;

  constructor(options: PgVectorStoreOptions) {
    this.pool = options.pool;
    this.table = sanitizeIdent(options.table ?? 'ziro_documents');
    this.dim = options.dimensions;
    if (options.embedder) this.embedder = options.embedder;
    this.distance = options.distance ?? '<=>';
    this.defaultSearchStrategy = options.defaultSearchStrategy;
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
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_fts
        ON ${this.table} USING gin (to_tsvector('english', text))`,
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
    const strategy = query.strategy ?? this.defaultSearchStrategy ?? 'vector';
    if (strategy === 'hybrid') {
      if (!query.text?.trim()) {
        throw new Error(
          'PgVectorStore.search: strategy "hybrid" requires non-empty query.text for Postgres FTS.',
        );
      }
      return this.searchHybrid(query);
    }
    return this.searchVectorOnly(query);
  }

  private denseSimilaritySql(vectorParam = '$1'): string {
    return this.distance === '<=>'
      ? `1 - (embedding ${this.distance} ${vectorParam}::vector)`
      : this.distance === '<#>'
        ? `-(embedding ${this.distance} ${vectorParam}::vector)`
        : `-(embedding ${this.distance} ${vectorParam}::vector)`;
  }

  private async searchVectorOnly(query: VectorQuery): Promise<SearchResult[]> {
    const topK = query.topK ?? 4;
    const vector = await this.resolveQueryVector(query);

    const params: unknown[] = [toVectorLiteral(vector), topK];
    let where = '';
    if (query.filter && Object.keys(query.filter).length > 0) {
      params.push(query.filter);
      where = `WHERE metadata @> $${params.length}::jsonb`;
    }

    const sim = this.denseSimilaritySql('$1');
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

  private async searchHybrid(query: VectorQuery): Promise<SearchResult[]> {
    const topK = query.topK ?? 4;
    const minScore = query.minScore ?? -Infinity;
    const queryText = query.text as string;
    const vector = await this.resolveQueryVector(query);
    const vecLit = toVectorLiteral(vector);
    const rrfK = query.rrfK ?? 60;
    const cap = Math.min(query.hybridCandidateLimit ?? 200, 500);

    const semantic = await this.fetchSemanticRanked(vecLit, cap, query.filter, minScore);
    let fts: FtsRow[] = [];
    try {
      fts = await this.fetchFtsRanked(queryText, vecLit, cap, query.filter);
    } catch {
      fts = [];
    }

    const ftsById = new Map(fts.map((r) => [r.id, r]));
    const semById = new Map(semantic.map((s) => [s.id, s]));

    const fused = reciprocalRankFusion([semantic, fts.map((f) => ({ id: f.id }))], rrfK);
    const mergedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

    const out: SearchResult[] = [];
    for (const id of mergedIds) {
      const s = semById.get(id);
      const f = ftsById.get(id);
      const text = s?.text ?? f?.text;
      if (!text) continue;
      const semanticScore = s?.score ?? num(f?.semantic_score) ?? -1;
      const bm25Score = f ? num(f.fts_score) : 0;
      const hit: SearchResult = {
        id,
        text,
        score: semanticScore,
        semanticScore,
        bm25Score,
        rrfScore: fused.get(id) ?? 0,
      };
      const meta = s?.metadata ?? f?.metadata ?? undefined;
      if (meta !== undefined) hit.metadata = meta;
      out.push(hit);
      if (out.length >= topK) break;
    }
    return out;
  }

  private async fetchSemanticRanked(
    vectorLiteral: string,
    cap: number,
    filter: Metadata | undefined,
    minScore: number,
  ): Promise<SearchResult[]> {
    const params: unknown[] = [vectorLiteral, cap];
    let where = '';
    if (filter && Object.keys(filter).length > 0) {
      params.push(filter);
      where = `WHERE metadata @> $${params.length}::jsonb`;
    }
    const sim = this.denseSimilaritySql('$1');
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

  private async fetchFtsRanked(
    queryText: string,
    vectorLiteral: string,
    cap: number,
    filter: Metadata | undefined,
  ): Promise<FtsRow[]> {
    const params: unknown[] = [queryText, vectorLiteral, cap];
    let extra = '';
    if (filter && Object.keys(filter).length > 0) {
      params.push(filter);
      extra = ` AND metadata @> $${params.length}::jsonb`;
    }
    const dense = this.denseSimilaritySql('$2');
    const sql = `SELECT id, text, metadata,
        ts_rank_cd(to_tsvector('english', text), plainto_tsquery('english', $1)) AS fts_score,
        ${dense} AS semantic_score
      FROM ${this.table}
      WHERE to_tsvector('english', text) @@ plainto_tsquery('english', $1)${extra}
      ORDER BY fts_score DESC
      LIMIT $3`;
    const { rows } = await this.pool.query<FtsRow>(sql, params);
    return rows;
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

function num(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'string' ? Number.parseFloat(v) : v;
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
