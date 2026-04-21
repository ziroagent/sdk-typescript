import { describe, expect, it } from 'vitest';
import {
  SlidingWindowConversationMemory,
  SummarizingConversationMemory,
} from './conversation-memory.js';

describe('SlidingWindowConversationMemory', () => {
  it('keeps all system messages and tails non-system', () => {
    const mem = new SlidingWindowConversationMemory(2);
    const out = mem.prepareForModel(
      [
        { role: 'system', content: 'a' },
        { role: 'system', content: 'b' },
        { role: 'user', content: '1' },
        { role: 'user', content: '2' },
        { role: 'user', content: '3' },
      ],
      { stepIndex: 1 },
    );
    expect(out.map((m) => m.role)).toEqual(['system', 'system', 'user', 'user']);
    expect((out[out.length - 1] as { content: string }).content).toBe('3');
  });
});

describe('SummarizingConversationMemory', () => {
  it('invokes onOverflow when non-system messages exceed the cap', async () => {
    const mem = new SummarizingConversationMemory({
      maxNonSystemMessages: 2,
      onOverflow: async (dropped) => {
        expect(dropped).toHaveLength(1);
        return [{ role: 'user', content: '[summary]' }];
      },
    });
    const out = await mem.prepareForModel(
      [
        { role: 'system', content: 's' },
        { role: 'user', content: 'old' },
        { role: 'user', content: 'mid' },
        { role: 'user', content: 'new' },
      ],
      { stepIndex: 1 },
    );
    expect(out.some((m) => m.role === 'user' && m.content === '[summary]')).toBe(true);
    expect(out.some((m) => m.role === 'user' && m.content === 'new')).toBe(true);
  });
});
