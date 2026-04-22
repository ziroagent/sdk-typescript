import { afterEach, describe, expect, it } from 'vitest';
import { APICallError, wrapModel } from '@ziro-agent/core';
import { createMockLanguageModel } from '@ziro-agent/core/testing';
import type { LanguageModel } from '@ziro-agent/core';
import { modelFallback, resetModelFallbackCircuitState } from './model-fallback.js';

describe('modelFallback', () => {
  afterEach(() => {
    resetModelFallbackCircuitState();
  });

  it('delegates to primary when it succeeds', async () => {
    const primary = createMockLanguageModel({ modelId: 'a', responsePrefix: 'A' });
    const fb = createMockLanguageModel({ modelId: 'b', responsePrefix: 'B' });
    const wrapped = wrapModel(primary, modelFallback({ fallbacks: [fb] }));
    const r = await wrapped.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(r.text.startsWith('A:')).toBe(true);
  });

  it('uses a fallback model after retryable failure on generate', async () => {
    const flaky: LanguageModel = {
      modelId: 'flaky',
      provider: 'mock',
      async generate() {
        throw new APICallError({ message: '429', statusCode: 429 });
      },
      async stream() {
        return new ReadableStream();
      },
    };
    const good = createMockLanguageModel({ modelId: 'good', responsePrefix: 'OK' });
    const wrapped = wrapModel(flaky, modelFallback({ fallbacks: [good] }));
    const r = await wrapped.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    });
    expect(r.text.startsWith('OK:')).toBe(true);
  });

  it('fires onFallback when falling back', async () => {
    const events: string[] = [];
    const flaky: LanguageModel = {
      modelId: 'flaky',
      provider: 'mock',
      async generate() {
        throw new APICallError({ message: '503', statusCode: 503 });
      },
      async stream() {
        return new ReadableStream();
      },
    };
    const good = createMockLanguageModel({ modelId: 'good' });
    const wrapped = wrapModel(
      flaky,
      modelFallback({
        fallbacks: [good],
        onFallback: (i) => events.push(`${i.fromModelId}->${i.toModelId}`),
      }),
    );
    await wrapped.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    });
    expect(events).toEqual(['flaky->good']);
  });

  it('opens circuit after consecutive primary failures and skips primary', async () => {
    let primaryCalls = 0;
    const flaky: LanguageModel = {
      modelId: 'flaky',
      provider: 'mock',
      async generate() {
        primaryCalls += 1;
        throw new APICallError({ message: '503', statusCode: 503 });
      },
      async stream() {
        return new ReadableStream();
      },
    };
    const good = createMockLanguageModel({ modelId: 'good', responsePrefix: 'FB' });
    const wrapped = wrapModel(
      flaky,
      modelFallback({
        fallbacks: [good],
        circuitBreaker: { failureThreshold: 2, resetMs: 60_000 },
      }),
    );
    const msg = { messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] as const };
    await wrapped.generate({ ...msg });
    expect(primaryCalls).toBe(1);
    await wrapped.generate({ ...msg });
    expect(primaryCalls).toBe(2);
    await wrapped.generate({ ...msg });
    expect(primaryCalls).toBe(2);
    await wrapped.generate({ ...msg });
    expect(primaryCalls).toBe(3);
  });
});
