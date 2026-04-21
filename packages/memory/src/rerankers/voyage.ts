import type { RerankerAdapter } from '../reranker.js';

export interface VoyageRerankerOptions {
  apiKey: string;
  /** Default `rerank-2`. */
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface VoyageRerankResponse {
  data?: Array<{ index: number; relevance_score?: number; document?: string }>;
}

/**
 * Voyage AI [Rerank API](https://docs.voyageai.com/reference/reranker-api).
 */
export function createVoyageReranker(options: VoyageRerankerOptions): RerankerAdapter {
  const base = options.baseUrl ?? 'https://api.voyageai.com/v1';
  const fetchFn = options.fetchImpl ?? fetch;
  const model = options.model ?? 'rerank-2';

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
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Voyage rerank HTTP ${res.status}: ${errBody.slice(0, 500)}`);
      }
      const data = (await res.json()) as VoyageRerankResponse;
      const rows = data.data ?? [];
      const out: { id: string; score: number }[] = [];
      for (const r of rows) {
        const doc = documents[r.index];
        if (!doc) continue;
        const score = r.relevance_score ?? 0;
        out.push({ id: doc.id, score });
      }
      return out;
    },
  };
}
