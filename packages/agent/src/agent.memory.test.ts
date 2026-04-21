import type { LanguageModel, ModelCallOptions, ModelGenerateResult } from '@ziro-agent/core';
import { InMemoryWorkingMemory, SlidingWindowConversationMemory } from '@ziro-agent/memory';
import { describe, expect, it } from 'vitest';
import { createAgent } from './agent.js';

const text = (t: string): ModelGenerateResult => ({
  text: t,
  content: [{ type: 'text', text: t }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

describe('createAgent memory', () => {
  it('injects working memory into the LLM request without mutating result.messages', async () => {
    let last: ModelCallOptions | undefined;
    const model: LanguageModel = {
      modelId: 'm',
      provider: 'mock',
      async generate(opts) {
        last = opts;
        return text('ok');
      },
      async stream() {
        throw new Error('stream');
      },
    };
    const working = new InMemoryWorkingMemory('thread', 't1');
    await working.write('- scratch item');

    const agent = createAgent({
      model,
      system: 'You are a test agent.',
      memory: { working },
    });
    const result = await agent.run({ prompt: 'hi' });

    const sys = last?.messages.find((m) => m.role === 'system');
    const sysText = sys?.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    expect(sysText).toContain('Working memory');
    expect(sysText).toContain('scratch item');

    const resultSys = result.messages.find((m) => m.role === 'system');
    expect(typeof resultSys?.content).toBe('string');
    expect(resultSys?.content as string).not.toContain('Working memory');
  });

  it('applies conversation memory window to the LLM request only', async () => {
    let last: ModelCallOptions | undefined;
    const model: LanguageModel = {
      modelId: 'm',
      provider: 'mock',
      async generate(opts) {
        last = opts;
        return text('done');
      },
      async stream() {
        throw new Error('stream');
      },
    };

    const msgs = [
      { role: 'system' as const, content: 'sys' },
      ...Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: `u${i}`,
      })),
    ];

    const agent = createAgent({
      model,
      memory: { conversation: new SlidingWindowConversationMemory(3) },
    });
    const result = await agent.run({ messages: msgs });

    const nonSystem = last?.messages.filter((m) => m.role !== 'system') ?? [];
    expect(nonSystem).toHaveLength(3);
    expect(result.messages.filter((m) => m.role === 'user')).toHaveLength(10);
    expect(result.messages.some((m) => m.role === 'assistant')).toBe(true);
  });
});
