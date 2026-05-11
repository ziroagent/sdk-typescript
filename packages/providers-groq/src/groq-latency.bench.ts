import { bench, describe } from 'vitest';
import { generateText } from '@ziro-agent/core';
import { createGroq } from './index.js';

/**
 * Optional **network** benchmark — skipped in CI unless `GROQ_API_KEY` is set.
 * Does not run in the root `pnpm bench` harness (core-only); execute explicitly:
 *
 *   pnpm --filter @ziro-agent/groq exec vitest bench --run src/groq-latency.bench.ts
 */
describe.skipIf(!process.env.GROQ_API_KEY)('groq cloud latency (network)', () => {
  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY! });
  const model = groq(process.env.GROQ_BENCH_MODEL ?? 'llama-3.3-70b-versatile');

  bench('generateText short prompt', async () => {
    await generateText({
      model,
      prompt: 'Say OK.',
      maxOutputTokens: 8,
    });
  });
});
