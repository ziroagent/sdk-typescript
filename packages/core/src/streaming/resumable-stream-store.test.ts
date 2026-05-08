import { describe, expect, it } from 'vitest';
import {
  InMemoryResumableStreamEventStore,
  isTerminalModelStreamPart,
  ResumableStreamError,
} from './resumable-stream-store.js';

describe('InMemoryResumableStreamEventStore', () => {
  it('getSessionMeta returns null for unknown key', async () => {
    const store = new InMemoryResumableStreamEventStore();
    await expect(store.getSessionMeta('unknown')).resolves.toBeNull();
  });

  it('getSessionMeta returns nextIndex 0 before any append', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const key = store.createResumeKey();
    await expect(store.getSessionMeta(key)).resolves.toEqual({
      nextIndex: 0,
      completed: false,
    });
  });

  it('getSessionMeta reflects completed and updatedAt after events', async () => {
    const now = () => 42;
    const store = new InMemoryResumableStreamEventStore({ now });
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'text-delta', textDelta: 'a' });
    await expect(store.getSessionMeta(key)).resolves.toEqual({
      nextIndex: 1,
      completed: false,
      updatedAt: 42,
    });
    await store.append(key, 1, { type: 'finish', finishReason: 'stop', usage: { totalTokens: 1 } });
    await expect(store.getSessionMeta(key)).resolves.toEqual({
      nextIndex: 2,
      completed: true,
      updatedAt: 42,
    });
  });

  it('treats error parts as completed', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'error', error: new Error('x') });
    await expect(store.getSessionMeta(key)).resolves.toMatchObject({
      nextIndex: 1,
      completed: true,
    });
  });

  it('rejects append after a terminal part', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'finish', finishReason: 'stop', usage: { totalTokens: 0 } });
    await expect(store.append(key, 1, { type: 'text-delta', textDelta: 'nope' })).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ResumableStreamError && /already completed/.test(String((e as Error).message)),
    );
  });

  it('markCompleted throws for unknown resumeKey', async () => {
    const store = new InMemoryResumableStreamEventStore();
    await expect(store.markCompleted('unknown')).rejects.toThrow(ResumableStreamError);
  });

  it('markCompleted closes incomplete session without terminal part', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'text-delta', textDelta: 'x' });
    await expect(store.getSessionMeta(key)).resolves.toMatchObject({ completed: false });
    await store.markCompleted(key);
    await expect(store.getSessionMeta(key)).resolves.toMatchObject({
      completed: true,
      nextIndex: 1,
    });
    await expect(store.append(key, 1, { type: 'text-delta', textDelta: 'y' })).rejects.toThrow(
      /already completed/,
    );
  });

  it('markCompleted is idempotent when already completed', async () => {
    const store = new InMemoryResumableStreamEventStore();
    const key = store.createResumeKey();
    await store.append(key, 0, { type: 'finish', finishReason: 'stop', usage: { totalTokens: 0 } });
    await expect(store.markCompleted(key)).resolves.toBeUndefined();
  });
});

describe('isTerminalModelStreamPart', () => {
  it('is true for finish and error only', () => {
    expect(
      isTerminalModelStreamPart({
        type: 'finish',
        finishReason: 'stop',
        usage: { totalTokens: 0 },
      }),
    ).toBe(true);
    expect(isTerminalModelStreamPart({ type: 'error', error: 'x' })).toBe(true);
    expect(isTerminalModelStreamPart({ type: 'text-delta', textDelta: 'a' })).toBe(false);
  });
});
