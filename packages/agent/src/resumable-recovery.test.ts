import type { LanguageModel, ModelStreamPart } from '@ziro-agent/core';
import { InMemoryResumableStreamEventStore, streamText } from '@ziro-agent/core';
import { describe, expect, it } from 'vitest';
import {
  type ContinueUpstreamMidToolCallError,
  isContinueUpstreamMidToolCallError,
  MID_TOOL_CALL_CONTINUE_UPSTREAM_HINT,
  streamTailNeedsAgentRecovery,
  tailBlocksContinueUpstream,
} from './resumable-stream-recovery.js';

function mockModel(): LanguageModel {
  return {
    modelId: 'm',
    provider: 'mock',
    async generate() {
      return {
        text: '',
        content: [],
        toolCalls: [],
        finishReason: 'stop',
        usage: { totalTokens: 0 },
      };
    },
    async stream() {
      const parts: ModelStreamPart[] = [
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 1 } },
      ];
      return new ReadableStream({
        start(c) {
          for (const p of parts) c.enqueue(p);
          c.close();
        },
      });
    },
  };
}

describe('resumable stream recovery (RFC 0018)', () => {
  it('isContinueUpstreamMidToolCallError narrows thrown error from streamText', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const key = store.createResumeKey();
    await store.append(key, 0, {
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'x',
      args: {},
    });

    try {
      await streamText({
        resumeKey: key,
        streamEventStore: store,
        continueUpstream: true,
        model: mockModel(),
        prompt: 'hi',
      });
      expect.fail('expected throw');
    } catch (e) {
      expect(isContinueUpstreamMidToolCallError(e)).toBe(true);
      expect((e as ContinueUpstreamMidToolCallError).code).toBe('CONTINUE_UPSTREAM_MID_TOOL_CALL');
    }
  });

  it('streamTailNeedsAgentRecovery matches tailBlocksContinueUpstream', () => {
    const parts: ModelStreamPart[] = [
      { type: 'tool-call', toolCallId: 'a', toolName: 't', args: {} },
    ];
    expect(streamTailNeedsAgentRecovery(parts)).toBe(tailBlocksContinueUpstream(parts));
  });

  it('hint string is non-empty guidance', () => {
    expect(MID_TOOL_CALL_CONTINUE_UPSTREAM_HINT).toMatch(/resumeFromCheckpoint/);
  });
});
