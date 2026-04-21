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

  it('adds fixed overhead for audio and file parts', () => {
    const textOnly = estimateTokensFromMessages([
      { role: 'user', content: [{ type: 'text', text: 'x' }] },
    ]);
    const withAudio = estimateTokensFromMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'x' },
          { type: 'audio', audio: 'data:audio/wav;base64,AA' },
        ],
      },
    ]);
    const withFile = estimateTokensFromMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'x' },
          { type: 'file', file: 'https://x/y.pdf', mimeType: 'application/pdf' },
        ],
      },
    ]);
    expect(withAudio - textOnly).toBe(128);
    expect(withFile - textOnly).toBe(256);
  });

  it('adds fixed overhead for video parts', () => {
    const textOnly = estimateTokensFromMessages([
      { role: 'user', content: [{ type: 'text', text: 'x' }] },
    ]);
    const withVideo = estimateTokensFromMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'x' },
          { type: 'video', video: 'https://x/y.mp4', mimeType: 'video/mp4' },
        ],
      },
    ]);
    expect(withVideo - textOnly).toBe(512);
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
