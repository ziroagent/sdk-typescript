import { describe, expect, it } from 'vitest';
import { createDroppedMessagesSnippetCompressor } from './conversation-compress-defaults.js';
import { SummarizingConversationMemory } from './conversation-memory.js';

describe('createDroppedMessagesSnippetCompressor', () => {
  it('injects a summary user message when overflow', async () => {
    const mem = new SummarizingConversationMemory({
      maxNonSystemMessages: 2,
      onOverflow: createDroppedMessagesSnippetCompressor({ maxCharsPerMessage: 80 }),
    });
    const msgs = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: '1' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: '2' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: '3' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: '4' }] },
    ];
    const out = await mem.prepareForModel(msgs, { threadId: undefined, stepIndex: 0 });
    expect(out.length).toBe(3);
    const summary = out[0];
    expect(summary?.role).toBe('user');
    const t = summary?.content[0];
    expect(t?.type === 'text' && t.text.includes('ziro.memory.compress')).toBe(true);
  });
});
