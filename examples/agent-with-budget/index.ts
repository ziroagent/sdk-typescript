/**
 * Budget Guard end-to-end demo for v0.1.5 + v0.1.6 — agent + tools + tracing.
 *
 * What this shows:
 *   1. `agent.run({ budget })` — a hard agent-wide ceiling that propagates
 *      down into every nested `generateText` and `executeToolCalls` via
 *      AsyncLocalStorage.
 *   2. `defineTool({ budget })` — a per-tool declared budget, intersected
 *      with the agent budget at call time.
 *   3. `onExceed: 'truncate'` — instead of throwing, return whatever the
 *      agent has produced so far plus a `budgetExceeded` summary.
 *   4. `instrumentBudget()` — bridge into OpenTelemetry; here we just install
 *      a no-op tracer so the observer fires without requiring an OTel SDK.
 *   5. **(v0.1.6) `onExceed` function form** — receive the overrun context
 *      and return a fallback `AgentRunResult`, e.g. by retrying on a cheaper
 *      model. This unlocks the "graceful degradation" pattern without
 *      reaching for try/catch around every `agent.run`.
 *
 * Run:   OPENAI_API_KEY=sk-... pnpm --filter @ziro-agent/example-agent-with-budget start
 */

import { createAgent } from '@ziro-agent/agent';
import { BudgetExceededError } from '@ziro-agent/core';
import { createOpenAI } from '@ziro-agent/openai';
import { defineTool } from '@ziro-agent/tools';
import { instrumentBudget } from '@ziro-agent/tracing';
import { z } from 'zod';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running this example.');
  process.exit(1);
}

// 4) Bridge budget lifecycle into the active tracer. With no OTel SDK
//    installed this is a no-op (the default no-op tracer absorbs every event)
//    but the observer still fires — uncomment the `setTracer(...)` line and
//    pass an OTel tracer to see real spans.
const { unregister } = instrumentBudget();

const openai = createOpenAI({ apiKey });
const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

// 2) Per-tool declared budget. `webSearch` is documented as expensive, so we
//    refuse to spend more than $0.05 on any single invocation regardless of
//    what the agent's outer budget allows.
const webSearch = defineTool({
  name: 'webSearch',
  description: 'Search the web. Expensive; capped at $0.05 per call.',
  input: z.object({ query: z.string() }),
  budget: { maxUsd: 0.05 },
  execute: async ({ query }) => {
    // Stand-in for a real web-search API call.
    return { query, hits: [`Top result for "${query}"`] };
  },
});

const sum = defineTool({
  name: 'sum',
  description: 'Add two numbers.',
  input: z.object({ a: z.number(), b: z.number() }),
  execute: ({ a, b }) => ({ result: a + b }),
});

const agent = createAgent({
  model,
  tools: { webSearch, sum },
  system: 'You are a helpful assistant. Use the available tools when useful.',
  maxSteps: 8,
});

console.log('--- 1) Successful run inside an agent budget ---');
const ok = await agent.run({
  prompt: 'What is 41 + 1?',
  budget: { maxUsd: 1.0, maxLlmCalls: 5, warnAt: { pctOfMax: 80 } },
});
console.log('  reply:', ok.text);
console.log(
  `  steps=${ok.steps.length}, totalTokens=${ok.totalUsage.totalTokens}, finishReason=${ok.finishReason}`,
);

console.log('\n--- 2) `onExceed: "truncate"` returns partial result instead of throwing ---');
const truncated = await agent.run({
  prompt: 'Search the web for "zero-knowledge proofs" and summarize.',
  budget: { maxLlmCalls: 1, onExceed: 'truncate' },
});
console.log(`  finishReason=${truncated.finishReason}`);
if (truncated.budgetExceeded) {
  console.log(
    `  budgetExceeded.kind=${truncated.budgetExceeded.kind}, ` +
      `limit=${truncated.budgetExceeded.limit}, ` +
      `observed=${truncated.budgetExceeded.observed}, ` +
      `origin=${truncated.budgetExceeded.origin}`,
  );
}
console.log(`  steps captured before halt: ${truncated.steps.length}`);

console.log('\n--- 3) Default `throw` mode raises BudgetExceededError ---');
try {
  await agent.run({
    prompt: 'Search "expensive" then add 1 + 1.',
    budget: { maxLlmCalls: 1 },
  });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.log(`  Caught: ${err.kind} > ${err.limit} (observed ${err.observed})`);
  } else {
    throw err;
  }
}

console.log('\n--- 4) v0.1.6: `onExceed` function form (fallback to a cheaper model) ---');
//   The resolver receives the overrun context. We respond by re-running on
//   the nano model with a relaxed ceiling and returning that as the
//   `replacement`. The shape MUST match `AgentRunResult` — see
//   `BudgetOnExceed` doc comment.
const cheapAgent = createAgent({
  model: openai('gpt-5.4-nano'),
  system: 'You are a terse assistant. Reply in one short sentence.',
  maxSteps: 1,
});

const fallback = await agent.run({
  prompt: 'Write three paragraphs about the history of zero-knowledge proofs.',
  budget: {
    // Tight ceiling that the flagship blows through almost immediately.
    maxUsd: 0.001,
    onExceed: async (ctx) => {
      console.log(
        `  resolver fired: ${ctx.spec.maxUsd} usd cap, observed ~${ctx.used.usd.toFixed(6)}`,
      );
      const cheap = await cheapAgent.run({
        prompt: 'In one sentence: what is a zero-knowledge proof?',
      });
      return { handled: true, replacement: cheap };
    },
  },
});
console.log(`  fallback reply: ${fallback.text}`);
console.log(`  finishReason=${fallback.finishReason}`);

unregister();
