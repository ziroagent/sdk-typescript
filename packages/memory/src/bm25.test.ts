import { describe, expect, it } from 'vitest';
import { BM25Index, tokenize } from './bm25.js';

describe('tokenize', () => {
  it('lowercases alphanumerics', () => {
    expect(tokenize('Hello, World! 123')).toEqual(['hello', 'world', '123']);
  });
});

describe('BM25Index', () => {
  it('ranks documents with rare query terms higher', () => {
    const idx = new BM25Index([
      { id: 'a', text: 'common common common' },
      { id: 'b', text: 'common raretoken' },
    ]);
    const ranked = idx.search('raretoken');
    expect(ranked[0]?.id).toBe('b');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });
});
