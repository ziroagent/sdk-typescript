import { describe, expect, it } from 'vitest';
import { createReplayLanguageModel, ReplayExhaustedError } from './replay-model.js';

describe('createReplayLanguageModel', () => {
  it('returns queued generate results in order', async () => {
    const m = createReplayLanguageModel([
      {
        text: 'a',
        content: [{ type: 'text', text: 'a' }],
        toolCalls: [],
        finishReason: 'stop',
        usage: { totalTokens: 1 },
      },
      {
        text: 'b',
        content: [{ type: 'text', text: 'b' }],
        toolCalls: [],
        finishReason: 'stop',
        usage: { totalTokens: 2 },
      },
    ]);
    const r1 = await m.generate({ messages: [] });
    const r2 = await m.generate({ messages: [] });
    expect(r1.text).toBe('a');
    expect(r2.text).toBe('b');
  });

  it('throws ReplayExhaustedError when the queue is empty', async () => {
    const m = createReplayLanguageModel([]);
    await expect(m.generate({ messages: [] })).rejects.toBeInstanceOf(ReplayExhaustedError);
  });
});
