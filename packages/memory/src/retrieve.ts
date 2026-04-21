import type { RerankerAdapter } from './reranker.js';
import type { SearchResult, VectorQuery, VectorStore } from './types.js';

export interface RetrieveOptions {
  store: VectorStore;
  query: VectorQuery;
  /**
   * When set, the store is queried with `topK: rerankPool`, then results are
   * re-ordered by the reranker before slicing to `query.topK`.
   */
  reranker?: RerankerAdapter;
  /** Pool size for initial vector/hybrid search before rerank. Default `max((query.topK ?? 4) * 4, 16)`. */
  rerankPool?: number;
}

/**
 * Retrieval pipeline: `store.search` then optional {@link RerankerAdapter}.
 * Use with {@link createCohereReranker} / {@link createVoyageReranker} for hosted rerank.
 */
export async function retrieve(options: RetrieveOptions): Promise<SearchResult[]> {
  const topK = options.query.topK ?? 4;
  const pool = options.rerankPool ?? Math.max(topK * 4, 16);
  const initial = await options.store.search({ ...options.query, topK: pool });
  if (!options.reranker) return initial.slice(0, topK);

  const text = options.query.text?.trim();
  if (!text) return initial.slice(0, topK);

  const ranked = await options.reranker.rerank(
    text,
    initial.map((h) => ({ id: h.id, text: h.text })),
  );
  const scoreById = new Map(ranked.map((r) => [r.id, r.score]));
  const sorted = [...initial].sort(
    (a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0),
  );
  return sorted.slice(0, topK).map((h) => {
    const rs = scoreById.get(h.id);
    if (rs === undefined) return h;
    return { ...h, score: rs };
  });
}
