import type { LanguageModel, ModelStreamPart } from '@ziro-agent/core';
import { ResumableStreamError, streamText } from '@ziro-agent/core';
import { describe, expect, it } from 'vitest';
import type { RedisLike } from './redis-checkpointer.js';
import { RedisResumableStreamEventStore } from './redis-resumable-stream-store.js';

/**
 * Minimal Redis stub with STRING + LIST commands used by
 * {@link RedisResumableStreamEventStore}.
 */
function redisListStub(): RedisLike {
  const strings = new Map<string, string>();
  const lists = new Map<string, string[]>();

  return {
    async command<T>(args: readonly (string | number)[]): Promise<T> {
      const cmd = String(args[0]).toUpperCase();
      const rest = args.slice(1).map(String);

      switch (cmd) {
        case 'SET': {
          const [k, v, arg3, arg4, arg5, arg6] = rest;
          if (k === undefined || v === undefined) throw new Error('SET');
          const isNx = [arg3, arg4, arg5, arg6].some((x) => x?.toUpperCase() === 'NX');
          if (isNx && strings.has(k)) {
            return null as T;
          }
          strings.set(k, v);
          const exIdx = [arg3, arg4, arg5, arg6].findIndex((x) => x?.toUpperCase() === 'EX');
          if (exIdx >= 0) {
            const vals = [arg3, arg4, arg5, arg6];
            void Number(vals[exIdx + 1]);
          }
          return 'OK' as T;
        }
        case 'GET': {
          const [k] = rest;
          return (strings.get(k ?? '') ?? null) as T;
        }
        case 'LLEN': {
          const [k] = rest;
          return (lists.get(k ?? '')?.length ?? 0) as T;
        }
        case 'RPUSH': {
          const k = rest[0];
          const vals = rest.slice(1);
          if (k === undefined) throw new Error('RPUSH');
          let list = lists.get(k);
          if (!list) {
            list = [];
            lists.set(k, list);
          }
          for (const v of vals) list.push(v);
          return list.length as T;
        }
        case 'LRANGE': {
          const [k, startStr, stopStr] = rest;
          const list = lists.get(k ?? '') ?? [];
          const start = Number(startStr);
          const stop = Number(stopStr);
          if (stop < 0) {
            return list.slice(start) as T;
          }
          return list.slice(start, stop + 1) as T;
        }
        case 'EXPIRE': {
          return 1 as T;
        }
        case 'DEL': {
          const [k] = rest;
          if (!k) return 0 as T;
          return (strings.delete(k) ? 1 : 0) as T;
        }
        default:
          throw new Error(`unsupported: ${cmd}`);
      }
    },
  };
}

function mockStreamModel(): LanguageModel {
  return {
    modelId: 'm',
    provider: 'mock',
    async generate() {
      return {
        text: 'x',
        content: [{ type: 'text', text: 'x' }],
        toolCalls: [],
        finishReason: 'stop',
        usage: { totalTokens: 1 },
      };
    },
    async stream() {
      const parts: ModelStreamPart[] = [
        { type: 'text-delta', textDelta: 'ab' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 2 } },
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

describe('RedisResumableStreamEventStore', () => {
  it('works end-to-end with streamText (resumable + replay)', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis });

    const out = await streamText({
      model: mockStreamModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    expect(out.resumeKey).toBeDefined();
    await expect(out.text()).resolves.toBe('ab');

    const again = await streamText({
      resumeKey: out.resumeKey as string,
      resumeFromIndex: 0,
      streamEventStore: store,
    });
    await expect(again.text()).resolves.toBe('ab');
  });

  it('throws for unknown resumeKey in replay mode', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis });
    await expect(store.getParts('missing', 0)).rejects.toThrow(/Unknown resumeKey/);
  });

  it('throws for out-of-order append index', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis });
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'text-delta', textDelta: 'x' });
    await expect(store.append(key, 2, { type: 'text-delta', textDelta: 'y' })).rejects.toThrow(
      /Out-of-order event index/,
    );
  });

  it('streamText: rejects with ResumableStreamError when maxEventsPerStream is exceeded', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis, maxEventsPerStream: 1 });
    const out = await streamText({
      model: mockStreamModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await expect(out.text()).rejects.toSatisfy(
      (e: unknown) => e instanceof ResumableStreamError && /event cap exceeded/.test(String(e)),
    );
  });

  it('streamText: rejects with ResumableStreamError when maxBytesPerStream is exceeded on first part', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis, maxBytesPerStream: 1 });
    const out = await streamText({
      model: mockStreamModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await expect(out.text()).rejects.toSatisfy(
      (e: unknown) => e instanceof ResumableStreamError && /byte cap exceeded/.test(String(e)),
    );
  });

  it('getSessionMeta: completed true and nextIndex after streamText finishes', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis });
    const out = await streamText({
      model: mockStreamModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await out.text();
    await expect(store.getSessionMeta(out.resumeKey as string)).resolves.toEqual({
      nextIndex: 2,
      completed: true,
      updatedAt: expect.any(Number),
    });
  });

  it('getSessionMeta works from another store instance sharing Redis', async () => {
    const redis = redisListStub();
    const writer = new RedisResumableStreamEventStore({ client: redis });
    const out = await streamText({
      model: mockStreamModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: writer,
    });
    await out.text();
    const reader = new RedisResumableStreamEventStore({ client: redis });
    await expect(reader.getSessionMeta(out.resumeKey as string)).resolves.toMatchObject({
      nextIndex: 2,
      completed: true,
    });
  });

  it('rejects append after terminal part', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis });
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'text-delta', textDelta: 'x' });
    await store.append(key, 1, { type: 'finish', finishReason: 'stop', usage: { totalTokens: 1 } });
    await expect(store.append(key, 2, { type: 'text-delta', textDelta: 'y' })).rejects.toThrow(
      /already completed/,
    );
  });

  it('streamText: custom measurePartBytes is used for byte cap (second event over budget)', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({
      client: redis,
      maxBytesPerStream: 150,
      measurePartBytes: () => 100,
    });
    const out = await streamText({
      model: mockStreamModel(),
      prompt: 'hi',
      resumable: true,
      streamEventStore: store,
    });
    await expect(out.text()).rejects.toSatisfy(
      (e: unknown) => e instanceof ResumableStreamError && /byte cap exceeded/.test(String(e)),
    );
  });

  it('continue lock: second acquire fails until release', async () => {
    const redis = redisListStub();
    const store = new RedisResumableStreamEventStore({ client: redis, continueLockSeconds: 60 });
    const key = store.createResumeKey();
    const lock = await store.acquireContinueLock(key);
    await expect(store.acquireContinueLock(key)).rejects.toThrow(/Continue lock already held/);
    await store.releaseContinueLock(lock);
    await expect(store.acquireContinueLock(key)).resolves.toBeDefined();
  });
});
