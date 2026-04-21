import { describe, expect, it } from 'vitest';
import { generateText } from '../generate-text.js';
import { createMockLanguageModel } from './mock-model.js';

describe('createMockLanguageModel', () => {
  it('echoes user text with prefix in generate()', async () => {
    const model = createMockLanguageModel({ responsePrefix: 'echo' });
    const r = await generateText({ model, prompt: 'hi' });
    expect(r.text).toBe('echo:hi');
    expect(r.usage.totalTokens).toBe(3);
  });

  it('honours custom generate()', async () => {
    const model = createMockLanguageModel({
      generate: async () => ({
        text: 'fixed',
        content: [{ type: 'text', text: 'fixed' }],
        toolCalls: [],
        finishReason: 'stop' as const,
        usage: { totalTokens: 1 },
      }),
    });
    const r = await generateText({ model, prompt: 'ignored' });
    expect(r.text).toBe('fixed');
  });
});
