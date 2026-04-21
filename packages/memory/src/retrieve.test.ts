import { describe, expect, it, vi } from 'vitest';
import { retrieve } from './retrieve.js';
import type { SearchResult, VectorQuery, VectorStore } from './types.js';

function mockStore(hits: SearchResult[]): VectorStore {
  return {
    upsert: vi.fn(),
    search: vi.fn().mockResolvedValue(hits),
    delete: vi.fn(),
  };
}

describe('retrieve', () => {
  it('returns initial slice when reranker omitted', async () => {
    const store = mockStore([
      { id: 'a', text: 'a', score: 0.9 },
      { id: 'b', text: 'b', score: 0.8 },
    ]);
    const r = await retrieve({ store, query: { text: 'q', topK: 1 } });
    expect(r).toHaveLength(1);
    expect(r[0]?.id).toBe('a');
  });

  it('reorders with reranker scores', async () => {
    const store = mockStore([
      { id: 'a', text: 'a', score: 0.9 },
      { id: 'b', text: 'b', score: 0.1 },
    ]);
    const reranker = {
      async rerank(_q: string, docs: ReadonlyArray<{ id: string; text: string }>) {
        return docs.map((d) => ({ id: d.id, score: d.id === 'b' ? 1 : 0 }));
      },
    };
    const r = await retrieve({
      store,
      query: { text: 'q', topK: 1 } as VectorQuery,
      reranker,
      rerankPool: 4,
    });
    expect(r[0]?.id).toBe('b');
  });
});
