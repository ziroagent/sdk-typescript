import type { ChatMessage } from '@ziro-agent/core';

/** Context passed to each {@link MemoryProcessor} step (RFC 0011). */
export interface MemoryProcessorContext {
  threadId?: string;
  stepIndex: number;
}

/**
 * Composable message transform before each LLM call — trim, inject, etc.
 * Runs after working-memory injection when used with `createAgent({ memory })`.
 */
export interface MemoryProcessor {
  readonly name?: string;
  process(
    messages: readonly ChatMessage[],
    ctx: MemoryProcessorContext,
  ): Promise<ChatMessage[]> | ChatMessage[];
}

export function composeMemoryProcessors(...processors: MemoryProcessor[]): MemoryProcessor {
  return {
    name: 'composed',
    async process(messages, ctx) {
      let m: ChatMessage[] = [...messages];
      for (const p of processors) {
        m = await Promise.resolve(p.process(m, ctx));
      }
      return m;
    },
  };
}

/** Keeps all `system` messages, then only the last `maxNonSystem` other messages. */
export function trimNonSystemMessageCount(maxNonSystem: number): MemoryProcessor {
  return {
    name: 'trim-non-system-count',
    process(messages) {
      const system = messages.filter((m) => m.role === 'system');
      const rest = messages.filter((m) => m.role !== 'system');
      return Promise.resolve([...system, ...rest.slice(-maxNonSystem)]);
    },
  };
}
