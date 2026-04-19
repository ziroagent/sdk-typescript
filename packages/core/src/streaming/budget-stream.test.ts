import { describe, expect, it, vi } from 'vitest';
import { BudgetExceededError } from '../budget/errors.js';
import { withBudget } from '../budget/scope.js';
import { streamText } from '../stream-text.js';
import type { LanguageModel, ModelStreamPart } from '../types/model.js';

/**
 * Build a streaming model that emits N text chunks of `chunkSize` chars each.
 * The provider records `aborted` when its `abortSignal` fires so we can
 * assert mid-stream cancellation actually reaches the underlying request.
 */
function chunkyStreamModel(opts: {
  chunks: number;
  chunkSize: number;
  modelId?: string;
  provider?: string;
}): LanguageModel & { abortedRef: { value: boolean } } {
  const abortedRef = { value: false };
  const model: LanguageModel = {
    modelId: opts.modelId ?? 'mock-stream',
    provider: opts.provider ?? 'mock',
    async generate() {
      throw new Error('not used');
    },
    async stream({ abortSignal }) {
      const chunkChars = 'a'.repeat(opts.chunkSize);
      let i = 0;
      return new ReadableStream<ModelStreamPart>({
        async pull(controller) {
          if (abortSignal?.aborted) {
            abortedRef.value = true;
            controller.close();
            return;
          }
          if (i >= opts.chunks) {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
              usage: {
                promptTokens: 1,
                completionTokens: opts.chunks * opts.chunkSize,
                totalTokens: 1 + opts.chunks * opts.chunkSize,
              },
            });
            controller.close();
            return;
          }
          i += 1;
          controller.enqueue({ type: 'text-delta', textDelta: chunkChars });
        },
        cancel() {
          abortedRef.value = true;
        },
      });
    },
  };
  return Object.assign(model, { abortedRef });
}

describe('streamText mid-stream budget abort', () => {
  it('passes through cleanly when projected total stays under the limit', async () => {
    // 3 small chunks (~36 chars / ~9 tokens) under a 1000-token cap.
    const model = chunkyStreamModel({ chunks: 3, chunkSize: 12 });
    const r = await streamText({
      model,
      prompt: 'hi',
      budget: { maxTokens: 1000 },
    });
    const text = await r.text();
    expect(text.length).toBe(36);
    expect(model.abortedRef.value).toBe(false);
  });

  it('aborts mid-stream and surfaces BudgetExceededError on text() when projection trips', async () => {
    // 100 chunks * 100 chars = 10k chars ≈ 2500 tokens; cap at 200 → trips after a few chunks.
    const model = chunkyStreamModel({ chunks: 100, chunkSize: 100 });
    const r = await streamText({
      model,
      prompt: 'hi',
      budget: { maxTokens: 200 },
    });
    await expect(r.text()).rejects.toBeInstanceOf(BudgetExceededError);
    expect(model.abortedRef.value).toBe(true);
    // Aggregate promises share the same rejection — observe it explicitly so
    // it doesn't surface as an unhandled rejection.
    await r.usage().catch(() => {});
  });

  it('reflects aborted scope by flagging the chained abortSignal on the provider', async () => {
    const model = chunkyStreamModel({ chunks: 100, chunkSize: 100 });
    const r = await streamText({
      model,
      prompt: 'hi',
      budget: { maxTokens: 50 },
    });
    // Drain via fullStream — should error out partway.
    let saw: unknown = null;
    try {
      const reader = r.fullStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch (err) {
      saw = err;
    }
    expect(saw).toBeInstanceOf(BudgetExceededError);
    expect(model.abortedRef.value).toBe(true);
    // Consume the aggregate promises that share the same rejection so they
    // don't surface as unhandled rejections.
    await r.text().catch(() => {});
  });

  it('honors onExceed function form at pre-flight (returns replacement instead of opening stream)', async () => {
    // Use a real-pricing model so pre-flight can compute a USD estimate.
    const model: LanguageModel = {
      modelId: 'gpt-4o-mini',
      provider: 'openai',
      async generate() {
        throw new Error('not used');
      },
      async stream() {
        // Should never run when pre-flight resolves.
        throw new Error('stream() should not have been called');
      },
    };
    const onExceed = vi.fn(() => ({
      handled: true,
      replacement: {
        textStream: new ReadableStream<string>({ start: (c) => c.close() }),
        fullStream: new ReadableStream<ModelStreamPart>({ start: (c) => c.close() }),
        toTextIterable: () => (async function* () {})(),
        text: async () => '[fallback]',
        finishReason: async () => 'stop' as const,
        usage: async () => ({}),
        toolCalls: async () => [],
        content: async () => [],
      },
    }));

    const r = await streamText({
      model,
      prompt: 'x'.repeat(20_000),
      budget: { maxUsd: 0.0000001, onExceed },
    });
    expect(onExceed).toHaveBeenCalledOnce();
    await expect(r.text()).resolves.toBe('[fallback]');
  });

  it('does not abort when no scope is active (back-compat)', async () => {
    const model = chunkyStreamModel({ chunks: 5, chunkSize: 50 });
    // No `budget` and no surrounding `withBudget` → no scope → no wrapper.
    const r = await streamText({ model, prompt: 'hi' });
    const text = await r.text();
    expect(text.length).toBe(250);
    expect(model.abortedRef.value).toBe(false);
  });

  it('parent withBudget scope is respected when streamText has no inline budget', async () => {
    const model = chunkyStreamModel({ chunks: 100, chunkSize: 100 });
    await withBudget({ maxTokens: 30 }, async () => {
      const r = await streamText({ model, prompt: 'hi' });
      await expect(r.text()).rejects.toBeInstanceOf(BudgetExceededError);
      await r.usage().catch(() => {});
    });
    expect(model.abortedRef.value).toBe(true);
  });
});
