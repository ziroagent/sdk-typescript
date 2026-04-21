import { describe, expect, it } from 'vitest';
import { createMockLanguageModel } from './mock-model.js';
import { recordLanguageModel } from './record-model.js';

describe('recordLanguageModel', () => {
  it('records generate calls', async () => {
    const base = createMockLanguageModel({ responsePrefix: 'x' });
    const { model, calls } = recordLanguageModel(base);
    await model.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.result.text).toBe('x:hi');
  });
});
