import { describe, expect, it } from 'vitest';
import { estimateTokensFromMessages, estimateTokensFromString } from './estimate-tokens.js';

describe('estimateTokensFromString', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokensFromString('')).toBe(0);
  });

  it('uses chars/4 with a floor of 1', () => {
    expect(estimateTokensFromString('a')).toBe(1);
    expect(estimateTokensFromString('abcd')).toBe(1);
    expect(estimateTokensFromString('a'.repeat(40))).toBe(10);
  });
});

describe('estimateTokensFromMessages', () => {
  it('is monotonic: more text = more tokens', () => {
    const small = estimateTokensFromMessages([{ role: 'user', content: 'hi' }]);
    const big = estimateTokensFromMessages([{ role: 'user', content: 'hi'.repeat(100) }]);
    expect(big).toBeGreaterThan(small);
  });

  it('handles array content with text + image parts', () => {
    const n = estimateTokensFromMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this' },
          { type: 'image', image: 'https://x/y.png' },
        ],
      },
    ]);
    // text part (~4) + image (85) + per-message overhead (3) + reply primer (3) >= 90.
    expect(n).toBeGreaterThanOrEqual(90);
  });

  it('counts tool-call args and tool-result payloads', () => {
    const n = estimateTokensFromMessages([
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'a', toolName: 'x', args: { foo: 'bar' } }],
      },
      {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 'a', toolName: 'x', result: { ok: true } }],
      },
    ]);
    expect(n).toBeGreaterThan(6);
  });

  it('handles empty conversation', () => {
    expect(estimateTokensFromMessages([])).toBe(3);
  });
});
