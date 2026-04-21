/**
 * Pluggable reranker step in retrieval pipelines (RFC 0012 row E4).
 * Reference adapters (Cohere, Voyage, …) can be added in follow-up PRs.
 */

export interface RerankDocument {
  readonly id: string;
  readonly text: string;
}

export interface RerankerAdapter {
  /**
   * Re-score `documents` for relevance to `query`. Must return the same ids
   * (subset allowed — dropped ids are treated as score 0).
   */
  rerank(
    query: string,
    documents: ReadonlyArray<RerankDocument>,
  ): Promise<ReadonlyArray<{ id: string; score: number }>>;
}

/** No-op reranker: preserves input order with synthetic descending scores. */
export const passthroughReranker: RerankerAdapter = {
  async rerank(_query, documents) {
    return documents.map((d, i) => ({ id: d.id, score: 1 - i * 1e-9 }));
  },
};
