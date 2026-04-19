import {
  BudgetExceededError,
  generateText,
  getCurrentBudget,
  streamText,
  withBudget,
} from '@ziro-agent/core';
import { createOpenAI } from '@ziro-agent/openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running this example.');
  process.exit(1);
}

const openai = createOpenAI({ apiKey });
const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

console.log('--- 1) Pre-flight throw: maxUsd is too low to even start ---');
try {
  await generateText({
    model,
    prompt: 'Write a 10-paragraph essay on the history of TypeScript.',
    maxTokens: 4096,
    budget: { maxUsd: 0.0000001 },
  });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`  Refused before network call: ${err.message}`);
    console.log(`  preflight=${err.preflight}, kind=${err.kind}`);
  } else {
    throw err;
  }
}

console.log('\n--- 2) A successful call inside a withBudget scope ---');
await withBudget({ maxUsd: 0.05, maxLlmCalls: 3 }, async () => {
  const r = await generateText({ model, prompt: 'Say hello in one short sentence.' });
  console.log('  reply:', r.text);

  const ctx = getCurrentBudget();
  console.log(`  used so far: $${ctx?.used.usd.toFixed(6)} / $${ctx?.spec.maxUsd}`);
  console.log(`  llm calls: ${ctx?.used.llmCalls} / ${ctx?.spec.maxLlmCalls}`);
});

console.log('\n--- 3) Hitting maxLlmCalls trips post-flight on the second call ---');
try {
  await withBudget({ maxLlmCalls: 1 }, async () => {
    await generateText({ model, prompt: 'A' });
    await generateText({ model, prompt: 'B' });
  });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`  Stopped after first call: ${err.kind} > ${err.limit}`);
  } else {
    throw err;
  }
}

console.log('\n--- 4) v0.1.6: streamText aborts mid-flight when projection trips ---');
//   We ask for a long essay but cap at a token budget the response will
//   exceed. The wrapper around the model stream runs `checkMidStream` per
//   `text-delta` and aborts the underlying HTTP request as soon as the
//   projected total crosses the limit.
const r = await streamText({
  model,
  prompt: 'Write a long essay on the cultural impact of jazz, in detail.',
  maxTokens: 2000,
  budget: { maxTokens: 80 },
});
let printed = 0;
try {
  for await (const chunk of r.toTextIterable()) {
    process.stdout.write(chunk);
    printed += chunk.length;
  }
  console.log('\n  (stream ended naturally)');
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`\n  Mid-stream abort: ${err.kind} ≥ ${err.limit} (observed ${err.observed})`);
    console.log(`  Bytes emitted before abort: ${printed}`);
  } else {
    throw err;
  }
}

console.log('\n--- 5) v0.1.6: `onExceed` function form returns a fallback result ---');
//   Pre-flight refuses the expensive call, but instead of throwing we
//   downshift to a brief reply. The resolver MUST return a value
//   shape-compatible with `GenerateTextResult` — see the doc on
//   `BudgetOnExceed` in `packages/core/src/budget/types.ts`.
const fallback = await generateText({
  model,
  prompt: 'Write a 10-paragraph essay on the history of TypeScript.',
  maxTokens: 4096,
  budget: {
    maxUsd: 0.0000001,
    onExceed: (ctx) => {
      console.log(`  resolver fired (${ctx.spec.maxUsd} usd cap) — substituting a stub reply.`);
      return {
        handled: true,
        replacement: {
          text: 'Budget too tight; here is a stub.',
          content: [{ type: 'text', text: 'Budget too tight; here is a stub.' }],
          toolCalls: [],
          finishReason: 'stop' as const,
          usage: {},
        },
      };
    },
  },
});
console.log(`  reply: ${fallback.text}`);
