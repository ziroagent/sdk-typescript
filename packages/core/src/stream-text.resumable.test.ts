import { describe, expect, it } from 'vitest';
import { streamText } from './stream-text.js';
import {
  InMemoryResumableStreamEventStore,
  ResumableStreamError,
} from './streaming/resumable-stream-store.js';
import type { LanguageModel, ModelStreamPart } from './types/model.js';

function mockStreamingModel(): LanguageModel {
  return {
    modelId: 'mock-stream',
    provider: 'mock',
    async generate() {
      return {
        text: 'unused',
        content: [{ type: 'text', text: 'unused' }],
        toolCalls: [],
        finishReason: 'stop',
        usage: { totalTokens: 1 },
      };
    },
    async stream() {
      const parts: ModelStreamPart[] = [
        { type: 'text-delta', textDelta: 'Hel' },
        { type: 'text-delta', textDelta: 'lo' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 5 } },
      ];
      return new ReadableStream({
        start(controller) {
          for (const part of parts) controller.enqueue(part);
          controller.close();
        },
      });
    },
  };
}

describe('streamText resumable', () => {
  it('returns resumeKey and can replay from a stored index', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const first = await streamText({
      model: mockStreamingModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });

    expect(first.resumeKey).toBeDefined();
    await expect(first.text()).resolves.toBe('Hello');

    const replay = await streamText({
      resumeKey: first.resumeKey as string,
      resumeFromIndex: 1,
      streamEventStore: store,
    });

    expect(replay.resumeKey).toBe(first.resumeKey);
    await expect(replay.text()).resolves.toBe('lo');
    await expect(replay.finishReason()).resolves.toBe('stop');
    await expect(replay.usage()).resolves.toEqual({ totalTokens: 5 });
  });

  it('throws when resumable is enabled without streamEventStore', async () => {
    await expect(
      streamText({
        model: mockStreamingModel(),
        prompt: 'hi',
        resumable: true,
      }),
    ).rejects.toThrow(/requires `streamEventStore`/);
  });

  it('throws a stable error for unknown resumeKey', async () => {
    const store = new InMemoryResumableStreamEventStore();
    await expect(
      streamText({
        resumeKey: 'missing-key',
        streamEventStore: store,
      }),
    ).rejects.toBeInstanceOf(ResumableStreamError);
  });

  it('replays only tail chunks when resumeFromIndex points to last text delta', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const first = await streamText({
      model: mockStreamingModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await first.text();

    const tail = await streamText({
      resumeKey: first.resumeKey as string,
      resumeFromIndex: 2,
      streamEventStore: store,
    });
    await expect(tail.text()).resolves.toBe('');
    await expect(tail.finishReason()).resolves.toBe('stop');
    await expect(tail.usage()).resolves.toEqual({ totalTokens: 5 });
  });

  it('throws when resumeFromIndex exceeds stored events', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const first = await streamText({
      model: mockStreamingModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await first.text();

    await expect(
      streamText({
        resumeKey: first.resumeKey as string,
        resumeFromIndex: 99,
        streamEventStore: store,
      }),
    ).rejects.toBeInstanceOf(ResumableStreamError);
  });
});
