import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SlidingWindowConversationMemory } from './conversation-memory.js';
import {
  DirConversationSnapshotStore,
  PersistingConversationMemory,
} from './conversation-persistence.js';

describe('conversation persistence', () => {
  it('persists prepareForModel output per thread', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-conv-'));
    const store = new DirConversationSnapshotStore(dir);
    const inner = new SlidingWindowConversationMemory(2);
    const mem = new PersistingConversationMemory({ inner, store });
    const msgs = [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'a' }] },
      { role: 'assistant' as const, content: [{ type: 'text' as const, text: 'b' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'c' }] },
    ];
    await mem.prepareForModel(msgs, { threadId: 't1', stepIndex: 0 });
    const disk = await store.load('t1');
    expect(disk?.length).toBe(2);
  });
});
