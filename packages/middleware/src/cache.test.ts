import {
  type LanguageModel,
  type ModelCallOptions,
  type ModelGenerateResult,
  wrapModel,
} from '@ziro-agent/core';
import { describe, expect, it, vi } from 'vitest';
import { type CacheStore, cache, MemoryCacheStore } from './cache.js';

const okResult = (text: string): ModelGenerateResult => ({
  text,
  content: [{ type: 'text', text }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

const baseCall = (text = 'hi'): ModelCallOptions => ({
  messages: [{ role: 'user', content: text }],
});

const makeModel = (text = 'fresh'): LanguageModel => {
  const generate = vi.fn(async () => okResult(text));
  return {
    modelId: 'mock',
    provider: 'mock',
    generate,
    stream: vi.fn(),
  };
};

describe('cache middleware', () => {
  it('miss → calls underlying model and stores result', async () => {
    const events: { hit: boolean; key: string }[] = [];
    const model = makeModel('one');
    const wrapped = wrapModel(model, cache({ onEvent: (e) => events.push(e) }));
    const r = await wrapped.generate(baseCall());
    expect(r.text).toBe('one');
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ hit: false, key: expect.any(String) }]);
  });

  it('hit → returns stored result without calling the model', async () => {
    const model = makeModel('one');
    const wrapped = wrapModel(model, cache());
    await wrapped.generate(baseCall());
    await wrapped.generate(baseCall());
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('different messages produce different cache keys (no false hit)', async () => {
    const model = makeModel('one');
    const wrapped = wrapModel(model, cache());
    await wrapped.generate(baseCall('hi'));
    await wrapped.generate(baseCall('different'));
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it('different sampling settings produce different cache keys', async () => {
    const model = makeModel('one');
    const wrapped = wrapModel(model, cache());
    await wrapped.generate({ ...baseCall(), temperature: 0 });
    await wrapped.generate({ ...baseCall(), temperature: 0.7 });
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it('TTL expiry forces a re-fetch', async () => {
    const model = makeModel('one');
    const wrapped = wrapModel(model, cache({ ttlMs: 50 }));
    await wrapped.generate(baseCall());
    await new Promise((r) => setTimeout(r, 60));
    await wrapped.generate(baseCall());
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it('headers and abortSignal are NOT part of the default key (cache hit)', async () => {
    const model = makeModel('one');
    const wrapped = wrapModel(model, cache());
    await wrapped.generate({ ...baseCall(), headers: { 'x-trace': 'a' } });
    await wrapped.generate({ ...baseCall(), headers: { 'x-trace': 'b' } });
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('respects custom keyOf (e.g. case-insensitive match)', async () => {
    const model = makeModel('one');
    const wrapped = wrapModel(
      model,
      cache({
        keyOf: (p) => JSON.stringify(p.messages.map((m) => String(m.content).toLowerCase())),
      }),
    );
    await wrapped.generate(baseCall('Hello'));
    await wrapped.generate(baseCall('HELLO'));
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('plug-in custom store is consulted', async () => {
    const customStore: CacheStore = {
      get: vi.fn(() => undefined),
      set: vi.fn(),
    };
    const model = makeModel('one');
    const wrapped = wrapModel(model, cache({ store: customStore }));
    await wrapped.generate(baseCall());
    expect(customStore.get).toHaveBeenCalledTimes(1);
    expect(customStore.set).toHaveBeenCalledTimes(1);
  });

  it('MemoryCacheStore.clear() drops every entry', () => {
    const s = new MemoryCacheStore();
    s.set('k', okResult('v'));
    expect(s.get('k')?.text).toBe('v');
    s.clear();
    expect(s.get('k')).toBeUndefined();
  });

  it('streaming path bypasses the cache (always passes through)', async () => {
    const model: LanguageModel = {
      modelId: 'mock',
      provider: 'mock',
      generate: vi.fn(),
      stream: vi.fn(async () => new ReadableStream()),
    };
    const wrapped = wrapModel(model, cache());
    await wrapped.stream(baseCall());
    await wrapped.stream(baseCall());
    expect(model.stream).toHaveBeenCalledTimes(2);
  });
});
