import { describe, expect, it } from 'vitest';
import { createCohereReranker } from './cohere.js';

describe('createCohereReranker', () => {
  it('POSTs to Cohere and maps scores by index', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          results: [
            { index: 1, relevance_score: 0.9 },
            { index: 0, relevance_score: 0.1 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const rr = createCohereReranker({ apiKey: 'k', fetchImpl });
    const out = await rr.rerank('q', [
      { id: 'a', text: 'first' },
      { id: 'b', text: 'second' },
    ]);
    expect(out[0]?.id).toBe('b');
    expect(out[0]?.score).toBe(0.9);
  });
});
