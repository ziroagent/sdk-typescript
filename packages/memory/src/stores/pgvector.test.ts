import { describe, expect, it, vi } from 'vitest';
import type { PgPoolLike } from './pgvector.js';
import { PgVectorStore } from './pgvector.js';

function fakePool(): PgPoolLike & { calls: Array<{ text: string; values?: unknown[] }> } {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  return {
    calls,
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      if (/ts_rank_cd/.test(text) && /plainto_tsquery/.test(text)) {
        return {
          rows: [
            {
              id: 'lex',
              text: 'lexical hit',
              metadata: null,
              fts_score: 2.0,
              semantic_score: 0.05,
            },
          ],
        };
      }
      if (/SELECT id, text, metadata/.test(text) && /ORDER BY embedding/.test(text)) {
        return {
          rows: [
            { id: 'vec', text: 'vector hit', metadata: null, score: 0.99 },
            { id: 'lex', text: 'lexical hit', metadata: null, score: 0.2 },
          ],
        };
      }
      if (/SELECT COUNT/.test(text)) return { rows: [{ count: '7' }] };
      return { rows: [] };
    },
  };
}

describe('PgVectorStore', () => {
  it('rejects invalid table identifiers', () => {
    expect(() => new PgVectorStore({ pool: fakePool(), table: 'bad name', dimensions: 3 })).toThrow(
      /Invalid identifier/,
    );
  });

  it('init() creates extension, table, ivfflat, and FTS index', async () => {
    const pool = fakePool();
    const store = new PgVectorStore({ pool, dimensions: 3 });
    await store.init();
    const sqls = pool.calls.map((c) => c.text).join('\n');
    expect(sqls).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/);
    expect(sqls).toMatch(/CREATE TABLE IF NOT EXISTS ziro_documents/);
    expect(sqls).toMatch(/CREATE INDEX IF NOT EXISTS ziro_documents_embedding_ivfflat/);
    expect(sqls).toMatch(/CREATE INDEX IF NOT EXISTS ziro_documents_fts/);
  });

  it('upsert validates dimensions and serializes vectors', async () => {
    const pool = fakePool();
    const store = new PgVectorStore({ pool, dimensions: 3 });
    await store.upsert([{ id: 'x', text: 'hello', embedding: [0.1, 0.2, 0.3] }]);
    const insert = pool.calls.find((c) => /INSERT INTO/.test(c.text));
    expect(insert).toBeTruthy();
    expect(insert?.values?.[2]).toBe('[0.1,0.2,0.3]');

    await expect(store.upsert([{ id: 'y', text: 'oops', embedding: [0.1] }])).rejects.toThrow(
      /dim mismatch/,
    );
  });

  it('search returns parsed scores and metadata', async () => {
    const pool = fakePool();
    const store = new PgVectorStore({ pool, dimensions: 3 });
    const hits = await store.search({ embedding: [0, 0, 1], topK: 5 });
    expect(hits).toHaveLength(2);
    expect(hits[0]?.id).toBe('vec');
    expect(hits[0]?.score).toBeCloseTo(0.99, 5);
  });

  it('hybrid search merges FTS and vector channels', async () => {
    const pool = fakePool();
    const store = new PgVectorStore({ pool, dimensions: 3 });
    const hits = await store.search({
      embedding: [0, 0, 1],
      text: 'quantum',
      strategy: 'hybrid',
      topK: 2,
    });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.rrfScore).toBeDefined();
    expect(hits.some((h) => h.id === 'lex')).toBe(true);
  });

  it('search applies metadata filter as JSONB containment', async () => {
    const pool = fakePool();
    const store = new PgVectorStore({ pool, dimensions: 3 });
    await store.search({ embedding: [0, 0, 1], filter: { src: 'docs' } });
    const sel = pool.calls.find(
      (c) => /SELECT id, text/.test(c.text) && !/ts_rank_cd/.test(c.text),
    );
    expect(sel?.text).toMatch(/metadata @> \$3::jsonb/);
    expect(sel?.values?.[2]).toEqual({ src: 'docs' });
  });

  it('count parses string COUNT(*) result', async () => {
    const pool = fakePool();
    const store = new PgVectorStore({ pool, dimensions: 3 });
    expect(await store.count()).toBe(7);
  });

  it('search requires text or embedding', async () => {
    const pool = fakePool();
    const store = new PgVectorStore({ pool, dimensions: 3 });
    await expect(store.search({})).rejects.toThrow(/embedding.*text/);
  });

  it('search uses configured embedder for text queries', async () => {
    const pool = fakePool();
    const embed = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
    const store = new PgVectorStore({
      pool,
      dimensions: 3,
      embedder: { id: 'fake', dimensions: 3, embed },
    });
    await store.search({ text: 'hello' });
    expect(embed).toHaveBeenCalledWith(['hello']);
  });
});
