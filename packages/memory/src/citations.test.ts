import { describe, expect, it } from 'vitest';
import { buildTextWithCitations } from './citations.js';

describe('buildTextWithCitations', () => {
  it('maps chunks to citation entries', () => {
    const twc = buildTextWithCitations('The answer.', [
      { id: 'c1', text: 'x'.repeat(300), score: 0.9 },
    ]);
    expect(twc.text).toBe('The answer.');
    expect(twc.citations[0]?.chunkId).toBe('c1');
    expect(twc.citations[0]?.snippet.length).toBeLessThanOrEqual(241);
  });
});
