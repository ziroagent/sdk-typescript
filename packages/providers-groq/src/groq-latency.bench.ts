import { generateText } from '@ziro-agent/core';
import { bench, describe } from 'vitest';
import { createGroq } from './index.js';

/**
 * Optional **network** benchmark — skipped in CI unless `GROQ_API_KEY` is set.
 * Does not run in the root `pnpm bench` harness (core-only); execute explicitly:
 *
 *   pnpm --filter @ziro-agent/groq exec vitest bench --run src/groq-latency.bench.ts
 */
describe.skipIf(!process.env.GROQ_API_KEY)('groq cloud latency (network)', () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY must be set when this suite runs');
  }
  const groq = createGroq({ apiKey });
  const model = groq(process.env.GROQ_BENCH_MODEL ?? 'llama-3.3-70b-versatile');

  bench('generateText short prompt', async () => {
    await generateText({
      model,
      prompt: 'Say OK.',
      maxTokens: 8,
    });
  });
});
