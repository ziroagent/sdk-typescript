/**
 * Generic, JSON-serializable metadata attached to documents and chunks.
 * Implementations should preserve unknown keys verbatim.
 */
export type Metadata = Record<string, unknown>;

/**
 * A piece of text being ingested into a vector store. The `id` is optional;
 * stores will generate a stable id (UUID v4) when not supplied.
 */
export interface Document {
  id?: string;
  text: string;
  metadata?: Metadata;
}

/**
 * A document with its dense vector embedding. Vectors must be the same
 * dimensionality across a single store / index.
 */
export interface EmbeddedDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Metadata;
}

/** Retrieval strategy (RFC 0012 — hybrid lexical + dense on supported stores). */
export type SearchStrategy = 'vector' | 'hybrid';

/**
 * A query against a vector store. Provide either `embedding` (already
 * computed) or `text` (the store may use its embedder, otherwise it errors).
 */
export interface VectorQuery {
  embedding?: number[];
  text?: string;
  /** Top-K. Defaults to 4. */
  topK?: number;
  /** Optional metadata filter — implementation defined. */
  filter?: Metadata;
  /** Inclusive minimum cosine similarity in `[-1, 1]`. */
  minScore?: number;
  /**
   * `hybrid` runs BM25 + dense cosine then RRF merge on stores that support it
   * (`MemoryVectorStore`, `PgVectorStore`). Requires `text` for the lexical
   * channel.
   */
  strategy?: SearchStrategy;
  /** RRF constant `k` (default 60). */
  rrfK?: number;
  /**
   * Max candidates per channel before fusion (default: all rows, capped at 200).
   */
  hybridCandidateLimit?: number;
}

/** A single search hit. `score` is cosine similarity in `[-1, 1]`. */
export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Metadata;
  /** When `strategy: 'hybrid'` — fused RRF score (higher is better). */
  rrfScore?: number;
  /** Dense cosine similarity for this hit (hybrid mode). */
  semanticScore?: number;
  /** BM25 relevance for this hit (hybrid mode). */
  bm25Score?: number;
}

/**
 * Retrieved chunk with explicit id for citations (RFC 0012). Same payload as
 * `SearchResult`; `chunkId` mirrors `id`.
 */
export type RetrievedChunk = SearchResult & { chunkId: string };

export function toRetrievedChunk(hit: SearchResult): RetrievedChunk {
  return { ...hit, chunkId: hit.id };
}

/**
 * Vector store contract used by RAG pipelines.
 *
 * Implementations:
 *   - `MemoryVectorStore` – in-memory, brute-force cosine; great for tests
 *   - `pgvector` adapter   – Postgres + `pgvector` extension
 *
 * Implementations SHOULD be safe for concurrent reads. Writes need not be
 * concurrent-safe unless documented.
 */
export interface VectorStore {
  /** Upsert pre-embedded documents. */
  upsert(docs: EmbeddedDocument[]): Promise<void>;
  /** Convenience: embed + upsert raw documents. Requires an embedder. */
  add?(docs: Document[]): Promise<void>;
  /** Cosine-similarity search. */
  search(query: VectorQuery): Promise<SearchResult[]>;
  /** Delete by id. */
  delete(ids: string[]): Promise<void>;
  /** Clear the entire store / namespace. */
  clear?(): Promise<void>;
  /** Total count. */
  count?(): Promise<number>;
}

/**
 * Embedding model contract. Returns one vector per input text. Vectors must
 * be normalized to unit length OR the caller must use cosine similarity.
 */
export interface EmbeddingModel {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
