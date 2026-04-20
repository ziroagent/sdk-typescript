import {
  APICallError,
  type LanguageModel,
  type ModelCallOptions,
  type ModelGenerateResult,
  type ModelStreamPart,
  wrapModel,
} from '@ziro-agent/core';
import { describe, expect, it, vi } from 'vitest';
import { retry } from './retry.js';

const okResult = (text: string): ModelGenerateResult => ({
  text,
  content: [{ type: 'text', text }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

const baseCall = (): ModelCallOptions => ({ messages: [{ role: 'user', content: 'hi' }] });

const makeModel = (
  generateImpl: (o: ModelCallOptions) => Promise<ModelGenerateResult>,
  streamImpl?: (o: ModelCallOptions) => Promise<ReadableStream<ModelStreamPart>>,
): LanguageModel => ({
  modelId: 'mock',
  provider: 'mock',
  generate: vi.fn(generateImpl),
  stream: vi.fn(streamImpl ?? (async () => new ReadableStream())),
});

// Deterministic helpers — no real wall-clock waits in tests.
const noWait = async () => {};
const fixedRandom = () => 0;

describe('retry middleware', () => {
  it('returns first success without retrying', async () => {
    const model = makeModel(async () => okResult('first'));
    const wrapped = wrapModel(model, retry({ sleep: noWait, random: fixedRandom }));
    const r = await wrapped.generate(baseCall());
    expect(r.text).toBe('first');
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('retries APICallError with isRetryable=true up to maxAttempts then succeeds', async () => {
    let calls = 0;
    const model = makeModel(async () => {
      calls++;
      if (calls < 3) throw new APICallError({ message: '503', statusCode: 503, isRetryable: true });
      return okResult('eventual');
    });
    const onRetry = vi.fn();
    const wrapped = wrapModel(
      model,
      retry({ maxAttempts: 5, sleep: noWait, random: fixedRandom, onRetry }),
    );
    const r = await wrapped.generate(baseCall());
    expect(r.text).toBe('eventual');
    expect(model.generate).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable APICallError (e.g. 400)', async () => {
    const err = new APICallError({ message: 'bad', statusCode: 400, isRetryable: false });
    const model = makeModel(async () => {
      throw err;
    });
    const wrapped = wrapModel(model, retry({ maxAttempts: 5, sleep: noWait, random: fixedRandom }));
    await expect(wrapped.generate(baseCall())).rejects.toBe(err);
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('does not retry plain Error by default', async () => {
    const err = new Error('typo in code');
    const model = makeModel(async () => {
      throw err;
    });
    const wrapped = wrapModel(model, retry({ maxAttempts: 5, sleep: noWait, random: fixedRandom }));
    await expect(wrapped.generate(baseCall())).rejects.toBe(err);
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('throws the LAST error after exhausting maxAttempts', async () => {
    let calls = 0;
    const errors: APICallError[] = [];
    const model = makeModel(async () => {
      const e = new APICallError({ message: `fail${calls++}`, statusCode: 503, isRetryable: true });
      errors.push(e);
      throw e;
    });
    const wrapped = wrapModel(model, retry({ maxAttempts: 3, sleep: noWait, random: fixedRandom }));
    await expect(wrapped.generate(baseCall())).rejects.toMatchObject({ message: 'fail2' });
    expect(model.generate).toHaveBeenCalledTimes(3);
    // Sanity: the third (and last) thrown error is the one surfaced.
    expect(errors).toHaveLength(3);
  });

  it('respects custom isRetryable predicate', async () => {
    let calls = 0;
    const model = makeModel(async () => {
      calls++;
      if (calls < 2) throw new Error('flaky');
      return okResult('done');
    });
    const wrapped = wrapModel(
      model,
      retry({
        maxAttempts: 3,
        sleep: noWait,
        random: fixedRandom,
        isRetryable: (err) => err instanceof Error && err.message === 'flaky',
      }),
    );
    const r = await wrapped.generate(baseCall());
    expect(r.text).toBe('done');
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it('aborts retry sleep when params.abortSignal fires', async () => {
    const ac = new AbortController();
    let calls = 0;
    const model = makeModel(async () => {
      calls++;
      throw new APICallError({ message: '503', statusCode: 503, isRetryable: true });
    });
    // sleep that watches the signal
    const sleep = (ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const t = setTimeout(resolve, ms);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(signal.reason);
          },
          { once: true },
        );
      });
    const wrapped = wrapModel(
      model,
      retry({ maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 1000, random: () => 1, sleep }),
    );
    const promise = wrapped.generate({ ...baseCall(), abortSignal: ac.signal });
    queueMicrotask(() => ac.abort(new Error('abort')));
    await expect(promise).rejects.toMatchObject({ message: 'abort' });
    expect(calls).toBeLessThanOrEqual(2);
  });

  it('wrapStream retries when doStream rejects before opening the stream', async () => {
    let calls = 0;
    const model: LanguageModel = {
      modelId: 'mock',
      provider: 'mock',
      generate: vi.fn(),
      stream: vi.fn(async () => {
        calls++;
        if (calls < 2)
          throw new APICallError({ message: '503', statusCode: 503, isRetryable: true });
        return new ReadableStream<ModelStreamPart>({
          start(controller) {
            controller.enqueue({ type: 'text-delta', textDelta: 'ok' });
            controller.close();
          },
        });
      }),
    };
    const wrapped = wrapModel(model, retry({ maxAttempts: 3, sleep: noWait, random: fixedRandom }));
    const stream = await wrapped.stream(baseCall());
    expect(model.stream).toHaveBeenCalledTimes(2);
    const reader = stream.getReader();
    const { value } = await reader.read();
    expect(value).toEqual({ type: 'text-delta', textDelta: 'ok' });
  });
});
