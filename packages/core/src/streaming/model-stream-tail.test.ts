import { describe, expect, it } from 'vitest';
import { tailBlocksContinueUpstream } from './model-stream-tail.js';

describe('tailBlocksContinueUpstream', () => {
  it('returns false for empty log', () => {
    expect(tailBlocksContinueUpstream([])).toBe(false);
  });

  it('returns false when last substantive part is finish stop', () => {
    expect(
      tailBlocksContinueUpstream([
        { type: 'text-delta', textDelta: 'hi' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 1 } },
      ]),
    ).toBe(false);
  });

  it('returns true when last substantive part is finish tool-calls', () => {
    expect(
      tailBlocksContinueUpstream([
        { type: 'tool-call', toolCallId: 'c1', toolName: 'x', args: {} },
        { type: 'finish', finishReason: 'tool-calls', usage: { totalTokens: 2 } },
      ]),
    ).toBe(true);
  });

  it('returns true when log ends with tool-call', () => {
    expect(
      tailBlocksContinueUpstream([
        { type: 'text-delta', textDelta: 'hi' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'x', args: {} },
      ]),
    ).toBe(true);
  });

  it('returns true when log ends with tool-call-delta', () => {
    expect(
      tailBlocksContinueUpstream([
        { type: 'tool-call-delta', toolCallId: 'c1', toolName: 'x', argsDelta: '{' },
      ]),
    ).toBe(true);
  });

  it('ignores trailing error parts after a valid finish', () => {
    expect(
      tailBlocksContinueUpstream([
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 1 } },
        { type: 'error', error: new Error('x') },
      ]),
    ).toBe(false);
  });

  it('returns false when only trailing errors exist', () => {
    expect(tailBlocksContinueUpstream([{ type: 'error', error: new Error('x') }])).toBe(false);
  });
});
