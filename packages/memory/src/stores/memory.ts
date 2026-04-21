import { BM25Index } from '../bm25.js';
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
import { cosineSimilarity } from '../util/cosine.js';
import { uuid } from '../util/uuid.js';

export interface MemoryVectorStoreOptions {
  /** Optional embedder enabling `add()` / `search({ text })`. */
  embedder?: EmbeddingModel;
  /** Expected vector dimensions; validated on every `upsert`. */
  dimensions?: number;
  /**
   * When `VectorQuery.strategy` is omitted, use this value. `hybrid` requires
   * non-empty `query.text` for the BM25 channel.
   */
  defaultSearchStrategy?: SearchStrategy;
}

interface Row {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Metadata;
}

/**
 * In-memory cosine-similarity vector store. Brute-force O(N) per query — use
 * for tests, demos, or small (<10k) corpora. For production workloads use a
 * dedicated store (pgvector, Qdrant, etc.).
 */
export class MemoryVectorStore implements VectorStore {
  private readonly rows = new Map<string, Row>();
  private readonly embedder?: EmbeddingModel;
  private readonly defaultSearchStrategy: SearchStrategy | undefined;
  private dim: number | undefined;

  constructor(options: MemoryVectorStoreOptions = {}) {
    this.embedder = options.embedder;
    this.dim = options.dimensions ?? options.embedder?.dimensions;
    this.defaultSearchStrategy = options.defaultSearchStrategy;
  }

  async upsert(docs: EmbeddedDocument[]): Promise<void> {
    for (const d of docs) {
      if (this.dim === undefined) this.dim = d.embedding.length;
      else if (d.embedding.length !== this.dim) {
        throw new Error(
          `MemoryVectorStore: vector dim mismatch (${d.embedding.length} vs expected ${this.dim})`,
        );
      }
      const row: Row = { id: d.id, text: d.text, embedding: d.embedding };
      if (d.metadata !== undefined) row.metadata = d.metadata;
      this.rows.set(d.id, row);
    }
  }

  async add(docs: Document[]): Promise<void> {
    if (!this.embedder) {
      throw new Error(
        'MemoryVectorStore.add: no embedder configured. Pass `embedder` to the constructor or call `upsert` with pre-computed embeddings.',
      );
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
    const minScore = query.minScore ?? -Infinity;
    const strategy = query.strategy ?? this.defaultSearchStrategy ?? 'vector';

    if (strategy === 'hybrid') {
      if (!query.text?.trim()) {
        throw new Error(
          'MemoryVectorStore.search: strategy "hybrid" requires non-empty query.text for BM25.',
        );
      }
      return this.hybridSearch(query, topK, minScore);
    }

    const queryVector = await this.resolveQueryVector(query);

    const hits: SearchResult[] = [];
    for (const row of this.rows.values()) {
      if (query.filter && !matchesFilter(row.metadata, query.filter)) continue;
      const score = cosineSimilarity(queryVector, row.embedding);
      if (score < minScore) continue;
      const hit: SearchResult = { id: row.id, text: row.text, score };
      if (row.metadata !== undefined) hit.metadata = row.metadata;
      hits.push(hit);
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  private async hybridSearch(
    query: VectorQuery,
    topK: number,
    minScore: number,
  ): Promise<SearchResult[]> {
    const queryText = query.text as string;
    const queryVector = await this.resolveQueryVector(query);
    const rrfK = query.rrfK ?? 60;
    const cap = Math.min(query.hybridCandidateLimit ?? 200, Math.max(1, this.rows.size));

    const rowsArr = [...this.rows.values()].filter(
      (row) => !query.filter || matchesFilter(row.metadata, query.filter),
    );

    const semanticFull: SearchResult[] = [];
    for (const row of rowsArr) {
      const score = cosineSimilarity(queryVector, row.embedding);
      if (score < minScore) continue;
      const hit: SearchResult = { id: row.id, text: row.text, score };
      if (row.metadata !== undefined) hit.metadata = row.metadata;
      semanticFull.push(hit);
    }
    semanticFull.sort((a, b) => b.score - a.score);
    const semanticRanked = semanticFull.slice(0, cap);

    const index = new BM25Index(rowsArr.map((r) => ({ id: r.id, text: r.text })));
    const bm25All = index.search(queryText).filter((h) => {
      const row = this.rows.get(h.id);
      if (!row) return false;
      if (query.filter && !matchesFilter(row.metadata, query.filter)) return false;
      return true;
    });
    const bm25Ranked = bm25All.slice(0, cap);

    const fused = reciprocalRankFusion(
      [semanticRanked, bm25Ranked.map((b) => ({ id: b.id }))],
      rrfK,
    );
    const byId = new Map(this.rows);
    const mergedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

    const out: SearchResult[] = [];
    for (const id of mergedIds) {
      const row = byId.get(id);
      if (!row) continue;
      const semanticScore = cosineSimilarity(queryVector, row.embedding);
      const bm25Score = bm25All.find((b) => b.id === id)?.score ?? 0;
      const hit: SearchResult = {
        id: row.id,
        text: row.text,
        score: semanticScore,
        semanticScore,
        bm25Score,
        rrfScore: fused.get(id) ?? 0,
      };
      if (row.metadata !== undefined) hit.metadata = row.metadata;
      out.push(hit);
      if (out.length >= topK) break;
    }
    return out;
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) this.rows.delete(id);
  }

  async clear(): Promise<void> {
    this.rows.clear();
  }

  async count(): Promise<number> {
    return this.rows.size;
  }

  private async resolveQueryVector(query: VectorQuery): Promise<number[]> {
    if (query.embedding) return query.embedding;
    if (query.text) {
      if (!this.embedder) {
        throw new Error(
          'MemoryVectorStore.search: query.text requires an embedder. Pass `embedder` to the constructor or use query.embedding.',
        );
      }
      const [v] = await this.embedder.embed([query.text]);
      return v as number[];
    }
    throw new Error('MemoryVectorStore.search: query must have `embedding` or `text`.');
  }
}

/**
 * Shallow metadata equality filter. All filter keys must match the row's
 * metadata exactly. Nested objects are compared by JSON-stringified equality.
 */
function matchesFilter(metadata: Metadata | undefined, filter: Metadata): boolean {
  if (!metadata) return Object.keys(filter).length === 0;
  for (const [k, v] of Object.entries(filter)) {
    const rv = metadata[k];
    if (rv === v) continue;
    if (
      rv !== null &&
      v !== null &&
      typeof rv === 'object' &&
      typeof v === 'object' &&
      JSON.stringify(rv) === JSON.stringify(v)
    ) {
      continue;
    }
    return false;
  }
  return true;
}
