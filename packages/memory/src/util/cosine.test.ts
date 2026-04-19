import { describe, expect, it } from 'vitest';
import { cosineSimilarity, normalize } from './cosine.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns 0 when either input is zero', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('throws on dim mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe('normalize', () => {
  it('produces a unit-length vector', () => {
    const n = normalize([3, 4]);
    expect(n[0]).toBeCloseTo(0.6, 6);
    expect(n[1]).toBeCloseTo(0.8, 6);
  });

  it('returns a fresh copy of zero vectors', () => {
    const v = [0, 0, 0];
    const n = normalize(v);
    expect(n).toEqual([0, 0, 0]);
    expect(n).not.toBe(v);
  });
});
