/**
 * L2 — competitor benchmark harness (RFC: BENCHMARKS public numbers).
 *
 * Measures **pure SDK overhead** of Ziro's `generateText` vs the Vercel AI SDK's
 * `generateText`, plus a no-SDK baseline. All three run against a zero-latency
 * in-memory mock model so the comparison isolates the framework's per-call cost
 * — NOT provider/network latency (which would dominate and be unfair to compare).
 *
 * Reproducible offline (no API keys). Run: `pnpm bench`.
 * Methodology + how to read the numbers: see BENCHMARKS.md.
 */
import { generateText as aiGenerateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { bench, describe } from 'vitest';
import { generateText } from '../generate-text.js';
import type { LanguageModel, ModelStreamPart } from '../types/model.js';

/** Ziro zero-latency mock — identical workload to the AI SDK mock below. */
const ziroModel: LanguageModel = {
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
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'finish', finishReason: 'stop', usage: { totalTokens: 5 } },
    ];
    return new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(p);
        c.close();
      },
    });
  },
};

/**
 * Vercel AI SDK zero-latency mock returning the same content/usage. The
 * `doGenerate` result is cast to the constructor's accepted type so this bench
 * isn't coupled to the AI SDK's exact internal `LanguageModelV3` result shape
 * (which churns between minor versions); runtime behaviour is what we measure.
 */
type MockV3Args = NonNullable<ConstructorParameters<typeof MockLanguageModelV3>[0]>;
const aiModel = new MockLanguageModelV3({
  doGenerate: (async () => ({
    content: [{ type: 'text', text: 'Hello' }],
    finishReason: 'stop',
    usage: { inputTokens: 1, outputTokens: 4, totalTokens: 5 },
    warnings: [],
  })) as unknown as MockV3Args['doGenerate'],
});

describe('SDK overhead — Ziro vs Vercel AI SDK (in-memory mock, no network)', () => {
  // Baseline: the model call with no SDK wrapper at all.
  bench('baseline: raw model.generate (no SDK)', async () => {
    await ziroModel.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });
  });

  bench('ziro: generateText', async () => {
    await generateText({ model: ziroModel, prompt: 'hi' });
  });

  bench('vercel-ai-sdk: generateText', async () => {
    await aiGenerateText({ model: aiModel, prompt: 'hi' });
  });
});
