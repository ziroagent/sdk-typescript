import { describe, expect, it } from 'vitest';
import { createVoyageReranker } from './voyage.js';

describe('createVoyageReranker', () => {
  it('POSTs to Voyage and maps scores by index', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 0, relevance_score: 0.88 },
            { index: 1, relevance_score: 0.12 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const rr = createVoyageReranker({ apiKey: 'k', fetchImpl });
    const out = await rr.rerank('q', [
      { id: 'x', text: 'alpha' },
      { id: 'y', text: 'beta' },
    ]);
    expect(out[0]?.id).toBe('x');
    expect(out[0]?.score).toBe(0.88);
  });
});
