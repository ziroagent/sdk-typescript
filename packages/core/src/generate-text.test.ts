import { describe, expect, it } from 'vitest';
import { BudgetExceededError } from './budget/errors.js';
import { getCurrentBudget, withBudget } from './budget/scope.js';
import { generateText } from './generate-text.js';
import { streamText } from './stream-text.js';
import type { LanguageModel, ModelStreamPart } from './types/model.js';

const mockModel = (text: string): LanguageModel => ({
  modelId: 'mock-1',
  provider: 'mock',
  async generate({ messages }) {
    const userText = messages
      .flatMap((m) => m.content)
      .filter((p) => p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join(' ');
    return {
      text: `${text}:${userText}`,
      content: [{ type: 'text', text: `${text}:${userText}` }],
      toolCalls: [],
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    };
  },
  async stream() {
    const parts: ModelStreamPart[] = [
      { type: 'text-delta', textDelta: 'Hel' },
      { type: 'text-delta', textDelta: 'lo' },
      { type: 'finish', finishReason: 'stop', usage: { totalTokens: 5 } },
    ];
    return new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(p);
        c.close();
      },
    });
  },
});

describe('generateText', () => {
  it('returns text from a model', async () => {
    const r = await generateText({ model: mockModel('echo'), prompt: 'hi' });
    expect(r.text).toBe('echo:hi');
    expect(r.usage.totalTokens).toBe(3);
    expect(r.finishReason).toBe('stop');
  });
});

describe('streamText', () => {
  it('streams text deltas and resolves aggregates', async () => {
    const r = await streamText({ model: mockModel('echo'), prompt: 'hi' });
    const chunks: string[] = [];
    for await (const c of r.toTextIterable()) chunks.push(c);
    expect(chunks.join('')).toBe('Hello');
    await expect(r.text()).resolves.toBe('Hello');
    await expect(r.finishReason()).resolves.toBe('stop');
    await expect(r.usage()).resolves.toEqual({ totalTokens: 5 });
  });
});

describe('generateText with budget', () => {
  it('opens an implicit scope when budget is passed', async () => {
    let captured: ReturnType<typeof getCurrentBudget>;
    const model: LanguageModel = {
      modelId: 'mock',
      provider: 'mock',
      async generate() {
        captured = getCurrentBudget();
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
    await generateText({ model, prompt: 'hi', budget: { maxLlmCalls: 5 } });
    expect(captured?.spec.maxLlmCalls).toBe(5);
    expect(captured?.used.llmCalls).toBe(0);
  });

  it('throws BudgetExceededError when llmCalls is exhausted', async () => {
    const model = mockModel('echo');
    await expect(
      withBudget({ maxLlmCalls: 1 }, async () => {
        await generateText({ model, prompt: 'a' });
        await generateText({ model, prompt: 'b' });
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('records token usage from completed calls into the parent scope', async () => {
    const model = mockModel('echo');
    await withBudget({ maxTokens: 100 }, async () => {
      await generateText({ model, prompt: 'a' });
      const ctx = getCurrentBudget();
      expect(ctx?.used.tokens).toBe(3);
      expect(ctx?.used.llmCalls).toBe(1);
    });
  });

  it('falls back to pricing table when model has no estimateCost (USD pre-flight)', async () => {
    // Provider id "openai" with modelId "gpt-4o-mini" matches our pricing row.
    const model: LanguageModel = {
      modelId: 'gpt-4o-mini',
      provider: 'openai',
      async generate() {
        return {
          text: 'x',
          content: [{ type: 'text', text: 'x' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { totalTokens: 1 },
        };
      },
      async stream() {
        return new ReadableStream({ start: (c) => c.close() });
      },
    };
    // Tiny USD ceiling — pre-flight should trip thanks to fallback estimator.
    await expect(
      generateText({ model, prompt: 'x'.repeat(2000), budget: { maxUsd: 0.0000001 } }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });
});
