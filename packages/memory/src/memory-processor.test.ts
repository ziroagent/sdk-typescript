import { describe, expect, it } from 'vitest';
import { composeMemoryProcessors, trimNonSystemMessageCount } from './memory-processor.js';

describe('composeMemoryProcessors', () => {
  it('chains processors', async () => {
    const p = composeMemoryProcessors(trimNonSystemMessageCount(1), {
      name: 'suffix',
      process(msgs) {
        const s = msgs[0];
        if (s && s.role === 'system') {
          return Promise.resolve([{ ...s, content: `${s.content}!` }, ...msgs.slice(1)]);
        }
        return Promise.resolve([...msgs]);
      },
    });
    const out = await p.process(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
      ],
      { stepIndex: 1 },
    );
    expect((out[0] as { content: string }).content).toBe('sys!');
    expect(out.filter((m) => m.role === 'user')).toHaveLength(1);
  });
});
