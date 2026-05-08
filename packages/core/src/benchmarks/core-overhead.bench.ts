import { bench, describe } from 'vitest';
import { generateText } from '../generate-text.js';
import { streamText } from '../stream-text.js';
import type { LanguageModel, ModelStreamPart } from '../types/model.js';

/** Deterministic in-process model — measures SDK path only (no HTTP). */
function benchMockModel(): LanguageModel {
  return {
    modelId: 'bench-mock',
    provider: 'mock',
    async generate() {
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
        start(controller) {
          for (const p of parts) {
            controller.enqueue(p);
          }
          controller.close();
        },
      });
    },
  };
}

const model = benchMockModel();

describe('core overhead (in-memory mock, no network)', () => {
  bench('generateText', async () => {
    await generateText({ model, prompt: 'hi' });
  });

  bench('streamText + text()', async () => {
    const r = await streamText({ model, prompt: 'hi' });
    await r.text();
  });
});
