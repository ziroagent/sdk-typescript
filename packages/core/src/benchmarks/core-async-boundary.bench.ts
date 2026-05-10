import { bench, describe } from 'vitest';
import { generateText } from '../generate-text.js';
import { streamText } from '../stream-text.js';
import type { LanguageModel, ModelStreamPart } from '../types/model.js';

/**
 * Tier-2 benchmark: same short completion as `core-overhead`, but each stream
 * chunk is separated by a microtask (`await Promise.resolve()`). Models real
 * adapters that yield between tokens without measuring HTTP latency.
 */
function asyncBoundaryMockModel(): LanguageModel {
  return {
    modelId: 'bench-async-mock',
    provider: 'mock',
    async generate() {
      await Promise.resolve();
      return {
        text: 'Hello',
        content: [{ type: 'text', text: 'Hello' }],
        toolCalls: [],
        finishReason: 'stop' as const,
        usage: { totalTokens: 5 },
      };
    },
    async stream() {
      const parts: ModelStreamPart[] = [
        { type: 'text-delta', textDelta: 'Hel' },
        { type: 'text-delta', textDelta: 'lo' },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 5 } },
      ];
      return new ReadableStream({
        async start(controller) {
          for (const p of parts) {
            await Promise.resolve();
            controller.enqueue(p);
          }
          controller.close();
        },
      });
    },
  };
}

const asyncModel = asyncBoundaryMockModel();

describe('core tier-2 — async boundary mock (microtasks, no HTTP)', () => {
  bench('generateText + microtask', async () => {
    await generateText({ model: asyncModel, prompt: 'hi' });
  });

  bench('streamText + text() + microtasks per chunk', async () => {
    const r = await streamText({ model: asyncModel, prompt: 'hi' });
    await r.text();
  });
});
