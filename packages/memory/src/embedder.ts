import type { EmbeddingModel } from './types.js';

/**
 * Adapter that turns OpenAI-compatible `/v1/embeddings` endpoints (OpenAI,
 * Together, Groq, vLLM, Azure, ...) into an {@link EmbeddingModel}.
 *
 * The implementation intentionally avoids depending on the OpenAI SDK so it
 * can run in any runtime that provides `fetch` (Node ≥ 20, browsers, edge).
 */
export interface OpenAIEmbeddingOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  /** Max items per request. The OpenAI server limit is 2048; default 96 keeps
   * payloads small enough to fit comfortably in serverless body limits. */
  batchSize?: number;
}

export function createOpenAIEmbedder(opts: OpenAIEmbeddingOptions = {}): EmbeddingModel {
  const apiKey = opts.apiKey ?? globalThis.process?.env?.OPENAI_API_KEY;
  const baseURL = (opts.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = opts.model ?? 'text-embedding-3-small';
  const dimensions = opts.dimensions ?? defaultDims(model);
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const batchSize = opts.batchSize ?? 96;
  if (!fetchImpl) throw new Error('createOpenAIEmbedder: no `fetch` available in this runtime.');

  return {
    id: model,
    dimensions,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const res = await fetchImpl(`${baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
            ...opts.headers,
          },
          body: JSON.stringify({
            model,
            input: batch,
            ...(opts.dimensions ? { dimensions: opts.dimensions } : {}),
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`OpenAI embeddings ${res.status}: ${body || res.statusText}`);
        }
        const json = (await res.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
        };
        const sorted = json.data.slice().sort((a, b) => a.index - b.index);
        for (const e of sorted) out.push(e.embedding);
      }
      return out;
    },
  };
}

function defaultDims(model: string): number {
  if (model.includes('text-embedding-3-large')) return 3072;
  if (model.includes('text-embedding-3-small')) return 1536;
  if (model.includes('text-embedding-ada-002')) return 1536;
  return 1536;
}
