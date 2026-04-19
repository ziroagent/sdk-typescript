import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker.js';

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('keeps short text as a single chunk', () => {
    expect(chunkText('hello world', { chunkSize: 100, chunkOverlap: 10 })).toEqual([
      'hello world',
    ]);
  });

  it('splits long text into chunks under the limit', () => {
    const text = 'a'.repeat(2500);
    const chunks = chunkText(text, { chunkSize: 1000, chunkOverlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });

  it('prefers paragraph boundaries when possible', () => {
    const text = ['para one', 'para two', 'para three'].join('\n\n');
    const chunks = chunkText(text, { chunkSize: 10, chunkOverlap: 0 });
    expect(chunks).toEqual(['para one', 'para two', 'para three']);
  });

  it('rejects invalid options', () => {
    expect(() => chunkText('x', { chunkSize: 0 })).toThrow();
    expect(() => chunkText('x', { chunkSize: 100, chunkOverlap: 100 })).toThrow();
    expect(() => chunkText('x', { chunkSize: 100, chunkOverlap: -1 })).toThrow();
  });

  it('honors trim option', () => {
    const out = chunkText('  hello  ', { chunkSize: 100, chunkOverlap: 0, trim: false });
    expect(out).toEqual(['  hello  ']);
  });
});
