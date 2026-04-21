import { describe, expect, it } from 'vitest';
import { APICallError } from '../errors.js';
import { createMockLanguageModel } from '../testing/mock-model.js';
import type { LanguageModel } from '../types/model.js';
import { withFallbackChain } from './fallback-model.js';

describe('withFallbackChain', () => {
  it('uses the primary model when it succeeds', async () => {
    const a = createMockLanguageModel({ modelId: 'a', responsePrefix: 'A' });
    const b = createMockLanguageModel({ modelId: 'b', responsePrefix: 'B' });
    const m = withFallbackChain([a, b]);
    const r = await m.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(r.text.startsWith('A:')).toBe(true);
  });

  it('falls back when the primary throws a retryable API error', async () => {
    let calls = 0;
    const flaky: LanguageModel = {
      modelId: 'flaky',
      provider: 'mock',
      async generate() {
        calls += 1;
        throw new APICallError({ message: 'rate limited', statusCode: 429 });
      },
      async stream() {
        return new ReadableStream();
      },
    };
    const good = createMockLanguageModel({ modelId: 'good', responsePrefix: 'OK' });
    const m = withFallbackChain([flaky, good]);
    const r = await m.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    });
    expect(calls).toBe(1);
    expect(r.text.startsWith('OK:')).toBe(true);
  });

  it('does not fall back on non-retryable API errors', async () => {
    const bad: LanguageModel = {
      modelId: 'bad',
      provider: 'mock',
      async generate() {
        throw new APICallError({ message: 'bad request', statusCode: 400 });
      },
      async stream() {
        return new ReadableStream();
      },
    };
    const good = createMockLanguageModel({ modelId: 'good' });
    const m = withFallbackChain([bad, good]);
    await expect(
      m.generate({ messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
