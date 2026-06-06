import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from '../errors.js';
import { generateText } from '../generate-text.js';
import { createMockLanguageModel } from '../testing/index.js';
import { isBudgetExceededError } from './errors.js';
import { getCurrentScope, withBudget } from './scope.js';

describe('budget composition fixes (C1 / C2 / C3)', () => {
  it('C2: nested scope usage is written back to the parent scope', async () => {
    // An LLM call inside a budgeted child scope must count against the
    // parent's cap. Use tokens (recorded regardless of pricing) as the probe.
    const model = createMockLanguageModel({ usage: { totalTokens: 100 } });
    let outerTokens = -1;
    let outerCalls = -1;
    await withBudget({ maxTokens: 10_000 }, async () => {
      await withBudget({ maxTokens: 10_000 }, async () => {
        await generateText({ model, prompt: 'hi' });
      });
      const outer = getCurrentScope();
      outerTokens = outer?.used.tokens ?? -1;
      outerCalls = outer?.used.llmCalls ?? -1;
    });
    expect(outerTokens).toBe(100);
    expect(outerCalls).toBe(1);
  });

  it('C2: a top-level (parentless) scope still records its own usage', async () => {
    const model = createMockLanguageModel({ usage: { totalTokens: 42 } });
    let tokens = -1;
    await withBudget({ maxTokens: 1000 }, async () => {
      await generateText({ model, prompt: 'hi' });
      tokens = getCurrentScope()?.used.tokens ?? -1;
    });
    expect(tokens).toBe(42);
  });

  it('C1: hard budget with maxUsd but no pricing throws (cannot enforce USD)', async () => {
    const model = createMockLanguageModel({ usage: { totalTokens: 5 } }); // provider 'mock' — no pricing row
    await expect(
      generateText({ model, prompt: 'hi', budget: { maxUsd: 1, hard: true } }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('C1: soft budget with maxUsd but no pricing does NOT throw (warns only)', async () => {
    const model = createMockLanguageModel({ usage: { totalTokens: 5 } });
    const res = await generateText({ model, prompt: 'hi', budget: { maxUsd: 1 } });
    expect(res.text).toContain('mock:');
  });

  it('C3: hard budget caps output tokens to what the remaining USD affords', async () => {
    // gpt-4o has verified pricing (output $10 / 1M). $0.01 budget ≈ 1000 output tokens.
    let receivedMaxTokens: number | undefined = -1;
    const model = createMockLanguageModel({
      provider: 'openai',
      modelId: 'gpt-4o',
      generate: async (opts) => {
        receivedMaxTokens = opts.maxTokens;
        return {
          text: 'ok',
          content: [{ type: 'text', text: 'ok' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { totalTokens: 1 },
        };
      },
    });
    await generateText({ model, prompt: 'hi', budget: { maxUsd: 0.01, hard: true } });
    expect(receivedMaxTokens).toBeGreaterThan(0);
    expect(receivedMaxTokens).toBeLessThanOrEqual(1000);
  });

  it('C3: a soft budget does NOT inject maxTokens (model stays uncapped)', async () => {
    let receivedMaxTokens: number | undefined = 123;
    const model = createMockLanguageModel({
      provider: 'openai',
      modelId: 'gpt-4o',
      generate: async (opts) => {
        receivedMaxTokens = opts.maxTokens;
        return {
          text: 'ok',
          content: [{ type: 'text', text: 'ok' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { totalTokens: 1 },
        };
      },
    });
    await generateText({ model, prompt: 'hi', budget: { maxUsd: 1 } });
    expect(receivedMaxTokens).toBeUndefined();
  });

  it('isBudgetExceededError matches a real budget error and rejects others', async () => {
    const model = createMockLanguageModel({ usage: { totalTokens: 1 } });
    let caught: unknown;
    try {
      // maxLlmCalls: 0 trips pre-flight on the very first call.
      await generateText({ model, prompt: 'hi', budget: { maxLlmCalls: 0 } });
    } catch (err) {
      caught = err;
    }
    expect(isBudgetExceededError(caught)).toBe(true);
    expect(isBudgetExceededError(new Error('nope'))).toBe(false);
    expect(isBudgetExceededError(undefined)).toBe(false);
  });
});
