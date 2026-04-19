import { describe, expect, it } from 'vitest';
import type { EmbeddingModel } from '../types.js';
import { MemoryVectorStore } from './memory.js';

const fakeEmbedder: EmbeddingModel = {
  id: 'fake',
  dimensions: 3,
  async embed(texts) {
    // Deterministic embedding: char-code histogram bucketed into 3 dims.
    return texts.map((t) => {
      const v = [0, 0, 0];
      for (let i = 0; i < t.length; i++) v[t.charCodeAt(i) % 3] += 1;
      return v;
    });
  },
};

describe('MemoryVectorStore', () => {
  it('upserts and searches by embedding', async () => {
    const store = new MemoryVectorStore({ dimensions: 2 });
    await store.upsert([
      { id: 'a', text: 'A', embedding: [1, 0] },
      { id: 'b', text: 'B', embedding: [0, 1] },
      { id: 'c', text: 'C', embedding: [0.9, 0.1] },
    ]);
    const hits = await store.search({ embedding: [1, 0], topK: 2 });
    expect(hits.map((h) => h.id)).toEqual(['a', 'c']);
    expect(hits[0]?.score).toBeCloseTo(1, 6);
  });

  it('rejects vectors with mismatched dimensions', async () => {
    const store = new MemoryVectorStore({ dimensions: 2 });
    await expect(store.upsert([{ id: 'x', text: 'x', embedding: [1, 0, 0] }])).rejects.toThrow(
      /dim mismatch/,
    );
  });

  it('uses embedder for add() and text-search', async () => {
    const store = new MemoryVectorStore({ embedder: fakeEmbedder });
    await store.add([
      { id: '1', text: 'hello' },
      { id: '2', text: 'world' },
    ]);
    expect(await store.count()).toBe(2);

    const hits = await store.search({ text: 'hello', topK: 1 });
    expect(hits[0]?.id).toBe('1');
  });

  it('filters by metadata equality', async () => {
    const store = new MemoryVectorStore({ dimensions: 2 });
    await store.upsert([
      { id: 'a', text: 'A', embedding: [1, 0], metadata: { src: 'docs' } },
      { id: 'b', text: 'B', embedding: [1, 0], metadata: { src: 'blog' } },
    ]);
    const hits = await store.search({ embedding: [1, 0], filter: { src: 'blog' } });
    expect(hits.map((h) => h.id)).toEqual(['b']);
  });

  it('respects minScore', async () => {
    const store = new MemoryVectorStore({ dimensions: 2 });
    await store.upsert([
      { id: 'a', text: 'A', embedding: [1, 0] },
      { id: 'b', text: 'B', embedding: [0, 1] },
    ]);
    const hits = await store.search({ embedding: [1, 0], minScore: 0.5 });
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });

  it('deletes and clears', async () => {
    const store = new MemoryVectorStore({ dimensions: 2 });
    await store.upsert([
      { id: 'a', text: 'A', embedding: [1, 0] },
      { id: 'b', text: 'B', embedding: [0, 1] },
    ]);
    await store.delete(['a']);
    expect(await store.count()).toBe(1);
    await store.clear();
    expect(await store.count()).toBe(0);
  });

  it('errors when add() called without embedder', async () => {
    const store = new MemoryVectorStore({ dimensions: 2 });
    await expect(store.add([{ text: 'x' }])).rejects.toThrow(/embedder/);
  });
});
