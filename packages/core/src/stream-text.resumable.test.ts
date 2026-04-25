import { describe, expect, it } from 'vitest';
import { streamText } from './stream-text.js';
import { setResumableStreamObserver } from './streaming/resumable-stream-observer.js';
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

function mockStreamingModelWithCalls(
  partsPerCall: ModelStreamPart[][],
): LanguageModel & { calls: number } {
  let calls = 0;
  return {
    modelId: 'mock-stream-calls',
    provider: 'mock',
    get calls() {
      return calls;
    },
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
      const idx = calls;
      calls++;
      const parts = partsPerCall[idx] ?? partsPerCall[partsPerCall.length - 1] ?? [];
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

    await expect(store.getSessionMeta(first.resumeKey as string)).resolves.toEqual({
      nextIndex: 3,
      completed: true,
      updatedAt: expect.any(Number),
    });

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

  it('throws when maxEventsPerStream cap is exceeded', async () => {
    const store = new InMemoryResumableStreamEventStore({ maxEventsPerStream: 2 });
    const out = await streamText({
      model: mockStreamingModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await expect(out.text()).rejects.toBeInstanceOf(ResumableStreamError);
    await expect(out.text()).rejects.toThrow(/event cap exceeded/);
  });

  it('throws when maxBytesPerStream cap is exceeded', async () => {
    const store = new InMemoryResumableStreamEventStore({
      maxBytesPerStream: 50,
      measurePartBytes: () => 30,
    });
    const out = await streamText({
      model: mockStreamingModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await expect(out.text()).rejects.toBeInstanceOf(ResumableStreamError);
    await expect(out.text()).rejects.toThrow(/byte cap exceeded/);
  });

  it('allows boundary-equal caps for events and bytes', async () => {
    const store = new InMemoryResumableStreamEventStore({
      maxEventsPerStream: 3,
      maxBytesPerStream: 90,
      measurePartBytes: () => 30,
    });
    const out = await streamText({
      model: mockStreamingModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await expect(out.text()).resolves.toBe('Hello');
  });

  it('continueUpstream: replays cached tail then appends live stream', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'text-delta', textDelta: 'ab' });

    const model = mockStreamingModelWithCalls([
      [
        { type: 'text-delta', textDelta: 'cd' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 2 } },
      ],
    ]);

    const resumed = await streamText({
      resumeKey: key,
      resumeFromIndex: 0,
      streamEventStore: store,
      continueUpstream: true,
      model,
      prompt: 'continue',
    });

    await expect(resumed.text()).resolves.toBe('abcd');
    expect(model.calls).toBe(1);
    await expect(store.getSessionMeta(key)).resolves.toMatchObject({
      nextIndex: 3,
      completed: true,
    });

    const replayAll = await streamText({
      resumeKey: key,
      streamEventStore: store,
    });
    await expect(replayAll.text()).resolves.toBe('abcd');
  });

  it('continueUpstream: does not call model when stream is already completed', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const first = await streamText({
      model: mockStreamingModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await first.text();

    const model = mockStreamingModelWithCalls([
      [
        { type: 'text-delta', textDelta: 'never' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 1 } },
      ],
    ]);
    const resumed = await streamText({
      resumeKey: first.resumeKey as string,
      streamEventStore: store,
      continueUpstream: true,
      model,
      prompt: 'continue',
    });

    await expect(resumed.text()).resolves.toBe('Hello');
    expect(model.calls).toBe(0);
  });

  it('continueUpstream: uses optional continue lock hooks when provided by store', async () => {
    const base = new InMemoryResumableStreamEventStore();
    const key = base.createResumeKey();
    await base.append(key, 0, { type: 'text-delta', textDelta: 'ab' });

    let acquired = 0;
    let released = 0;
    const store = Object.assign(base, {
      async acquireContinueLock(resumeKey: string) {
        acquired++;
        return { resumeKey, token: 't-1' };
      },
      async releaseContinueLock() {
        released++;
      },
    });

    const model = mockStreamingModelWithCalls([
      [
        { type: 'text-delta', textDelta: 'cd' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 2 } },
      ],
    ]);

    const resumed = await streamText({
      resumeKey: key,
      resumeFromIndex: 0,
      streamEventStore: store,
      continueUpstream: true,
      model,
      prompt: 'continue',
    });
    await expect(resumed.text()).resolves.toBe('abcd');
    expect(acquired).toBe(1);
    expect(released).toBe(1);
  });

  it('emits resumable observer phases for replay + continue', async () => {
    const events: string[] = [];
    setResumableStreamObserver({
      onEvent(event) {
        events.push(event.phase);
      },
    });
    try {
      const store = new InMemoryResumableStreamEventStore();
      const key = store.createResumeKey();
      await store.append(key, 0, { type: 'text-delta', textDelta: 'ab' });

      const model = mockStreamingModelWithCalls([
        [
          { type: 'text-delta', textDelta: 'cd' },
          { type: 'finish', finishReason: 'stop', usage: { totalTokens: 2 } },
        ],
      ]);

      const resumed = await streamText({
        resumeKey: key,
        resumeFromIndex: 0,
        streamEventStore: store,
        continueUpstream: true,
        model,
        prompt: 'continue',
      });
      await resumed.text();
    } finally {
      setResumableStreamObserver(null);
    }

    expect(events).toContain('replay_start');
    expect(events).toContain('continue_upstream_start');
    expect(events).toContain('continue_upstream_end');
    expect(events).toContain('replay_end');
  });
});
