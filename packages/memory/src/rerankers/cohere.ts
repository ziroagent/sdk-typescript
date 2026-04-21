import type { RerankerAdapter } from '../reranker.js';

export interface CohereRerankerOptions {
  apiKey: string;
  /** Default `rerank-english-v3.0`. */
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface CohereRerankResponse {
  results?: Array<{ index: number; relevance_score?: number }>;
}

/**
 * Cohere [Rerank API](https://docs.cohere.com/reference/rerank) (`/v1/rerank`).
 */
export function createCohereReranker(options: CohereRerankerOptions): RerankerAdapter {
  const base = options.baseUrl ?? 'https://api.cohere.ai/v1';
  const fetchFn = options.fetchImpl ?? fetch;
  const model = options.model ?? 'rerank-english-v3.0';

  return {
    async rerank(query, documents) {
      if (documents.length === 0) return [];
      const res = await fetchFn(`${base}/rerank`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          query,
          documents: documents.map((d) => d.text),
          top_n: documents.length,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Cohere rerank HTTP ${res.status}: ${errBody.slice(0, 500)}`);
      }
      const data = (await res.json()) as CohereRerankResponse;
      const results = data.results ?? [];
      const out: { id: string; score: number }[] = [];
      for (const r of results) {
        const doc = documents[r.index];
        if (!doc) continue;
        out.push({ id: doc.id, score: r.relevance_score ?? 0 });
      }
      return out;
    },
  };
}
