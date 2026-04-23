import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ChatMessage } from '@ziro-agent/core';

import type { ConversationMemory, ConversationMemoryContext } from './conversation-memory.js';

/**
 * Durable snapshot of the **model-facing** message list after
 * {@link ConversationMemory.prepareForModel} (RFC 0011 tier: conversation).
 */
export interface ConversationSnapshotStore {
  load(threadId: string): Promise<readonly ChatMessage[] | null>;
  save(threadId: string, messages: readonly ChatMessage[]): Promise<void>;
  delete(threadId: string): Promise<void>;
}

/** Deletes persisted conversation snapshots for each thread (RFC 0016 wiring). */
export async function deleteConversationSnapshotThreads(
  store: ConversationSnapshotStore,
  threadIds: readonly string[],
): Promise<void> {
  await Promise.all(threadIds.map((tid) => store.delete(tid)));
}

/**
 * One JSON file per thread under `directory` (`<threadId>.json`).
 */
export class DirConversationSnapshotStore implements ConversationSnapshotStore {
  constructor(private readonly directory: string) {}

  private pathFor(threadId: string): string {
    const safe = threadId.replace(/[/\\]/g, '_');
    return join(this.directory, `${safe}.json`);
  }

  async load(threadId: string): Promise<readonly ChatMessage[] | null> {
    try {
      const raw = await readFile(this.pathFor(threadId), 'utf8');
      return JSON.parse(raw) as ChatMessage[];
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(threadId: string, messages: readonly ChatMessage[]): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const target = this.pathFor(threadId);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(messages)}\n`, 'utf8');
    await rename(tmp, target);
  }

  async delete(threadId: string): Promise<void> {
    try {
      await unlink(this.pathFor(threadId));
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return;
      throw err;
    }
  }
}

export interface PersistingConversationMemoryOptions {
  inner: ConversationMemory;
  store: ConversationSnapshotStore;
}

/**
 * Runs {@link ConversationMemory.prepareForModel} on `inner`, then persists
 * the returned list for `ctx.threadId` when present.
 *
 * Hydration on cold start is intentionally **not** automatic — the agent loop
 * already owns the canonical transcript; this store is for durability,
 * analytics, and explicit reload paths.
 */
export class PersistingConversationMemory implements ConversationMemory {
  constructor(private readonly options: PersistingConversationMemoryOptions) {}

  async prepareForModel(
    messages: readonly ChatMessage[],
    ctx: ConversationMemoryContext,
  ): Promise<ChatMessage[]> {
    const out = await Promise.resolve(this.options.inner.prepareForModel(messages, ctx));
    if (ctx.threadId) await this.options.store.save(ctx.threadId, out);
    return out;
  }
}
