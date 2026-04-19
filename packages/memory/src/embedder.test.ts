import { describe, expect, it, vi } from 'vitest';
import { createOpenAIEmbedder } from './embedder.js';

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

describe('createOpenAIEmbedder', () => {
  it('returns embeddings sorted by index', async () => {
    const f = fakeFetch({
      data: [
        { embedding: [0.1, 0.2], index: 1 },
        { embedding: [0.3, 0.4], index: 0 },
      ],
    });
    const e = createOpenAIEmbedder({ fetch: f, apiKey: 'sk-x', model: 'text-embedding-3-small' });
    const out = await e.embed(['a', 'b']);
    expect(out).toEqual([
      [0.3, 0.4],
      [0.1, 0.2],
    ]);
  });

  it('batches requests', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { input: string[] };
      return new Response(
        JSON.stringify({
          data: body.input.map((_t, i) => ({ embedding: [i], index: i })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const e = createOpenAIEmbedder({ fetch: f, apiKey: 'k', batchSize: 2 });
    const out = await e.embed(['a', 'b', 'c', 'd', 'e']);
    expect(out).toHaveLength(5);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(3);
  });

  it('throws on non-2xx responses', async () => {
    const f = fakeFetch({ error: 'nope' }, 500);
    const e = createOpenAIEmbedder({ fetch: f, apiKey: 'k' });
    await expect(e.embed(['x'])).rejects.toThrow(/OpenAI embeddings 500/);
  });

  it('returns empty array for empty input', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const e = createOpenAIEmbedder({ fetch: f, apiKey: 'k' });
    expect(await e.embed([])).toEqual([]);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
  });
});
