import { describe, expect, it } from 'vitest';
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
