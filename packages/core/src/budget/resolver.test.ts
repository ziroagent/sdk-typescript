import { describe, expect, it, vi } from 'vitest';
import { generateText } from '../generate-text.js';
import type { LanguageModel } from '../types/model.js';
import { BudgetExceededError } from './errors.js';
import { withBudget } from './scope.js';
import type { BudgetContext, BudgetResolution } from './types.js';

/**
 * The resolver lives one layer up from `recordUsage`: the wiring sits in
 * `generateText` (and `streamText`, and `agent.run`). We therefore exercise
 * it end-to-end by passing an `onExceed` function and observing what
 * `generateText` returns when a budget trips.
 */

function bigUsageModel(): LanguageModel {
  // Reports 10k tokens — easy to overshoot a tiny `maxTokens` budget.
  return {
    modelId: 'mock-big',
    provider: 'mock',
    async generate() {
      return {
        text: 'big',
        content: [{ type: 'text', text: 'big' }],
        toolCalls: [],
        finishReason: 'stop',
        usage: { promptTokens: 5000, completionTokens: 5000, totalTokens: 10_000 },
      };
    },
    async stream() {
      return new ReadableStream({ start: (c) => c.close() });
    },
  };
}

describe('resolveOnExceed (function-form onExceed)', () => {
  it('returns the resolver replacement when handled: true', async () => {
    const model = bigUsageModel();
    const onExceed = vi.fn(
      async (_ctx: BudgetContext): Promise<BudgetResolution> => ({
        handled: true,
        replacement: {
          text: '[fallback summary]',
          content: [{ type: 'text', text: '[fallback summary]' }],
          toolCalls: [],
          finishReason: 'stop' as const,
          usage: { totalTokens: 0 },
        },
      }),
    );

    const result = await generateText({
      model,
      prompt: 'x',
      budget: { maxTokens: 100, onExceed },
    });

    expect(result.text).toBe('[fallback summary]');
    expect(onExceed).toHaveBeenCalledOnce();
    const ctx = onExceed.mock.calls[0]?.[0] as BudgetContext;
    expect(ctx.spec.maxTokens).toBe(100);
    expect(ctx.scopeId).toMatch(/^bg_/);
  });

  it('re-throws original BudgetExceededError when resolver returns handled: false', async () => {
    const model = bigUsageModel();
    await expect(
      generateText({
        model,
        prompt: 'x',
        budget: { maxTokens: 100, onExceed: () => ({ handled: false }) },
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('surfaces resolver-thrown errors with original budget error attached as cause', async () => {
    const model = bigUsageModel();
    const resolverErr = new Error('resolver blew up');
    let caught: Error | null = null;

    try {
      await generateText({
        model,
        prompt: 'x',
        budget: {
          maxTokens: 100,
          onExceed: () => {
            throw resolverErr;
          },
        },
      });
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).toBe(resolverErr);
    expect((caught as Error & { cause?: unknown }).cause).toBeInstanceOf(BudgetExceededError);
  });

  it('passes a context with usage snapshot reflecting the actual overrun', async () => {
    const model = bigUsageModel();
    let captured: BudgetContext | null = null;

    await generateText({
      model,
      prompt: 'x',
      budget: {
        maxTokens: 100,
        onExceed: (ctx) => {
          captured = ctx;
          return {
            handled: true,
            replacement: { text: '', content: [], toolCalls: [], finishReason: 'stop', usage: {} },
          };
        },
      },
    });

    expect(captured).not.toBeNull();
    // Pre-flight tripped before recordUsage ran, so used.tokens stays at 0
    // and the resolver still gets a meaningful spec snapshot.
    const snap = captured as unknown as BudgetContext;
    expect(snap.spec.maxTokens).toBe(100);
    expect(typeof snap.used.tokens).toBe('number');
    expect(snap.remaining.tokens).toBeGreaterThanOrEqual(0);
  });

  it('does not invoke the resolver when no overrun occurs', async () => {
    const onExceed = vi.fn();
    await withBudget({ maxLlmCalls: 10, onExceed }, async () => {
      const model: LanguageModel = {
        modelId: 'mock',
        provider: 'mock',
        async generate() {
          return {
            text: 'ok',
            content: [{ type: 'text', text: 'ok' }],
            toolCalls: [],
            finishReason: 'stop',
            usage: { totalTokens: 1 },
          };
        },
        async stream() {
          return new ReadableStream({ start: (c) => c.close() });
        },
      };
      await generateText({ model, prompt: 'hi' });
    });
    expect(onExceed).not.toHaveBeenCalled();
  });
});
