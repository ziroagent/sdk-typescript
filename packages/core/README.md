# @ziro-agent/core

Type-safe core for the ZiroAgent SDK: language model interface, `generateText`, `streamText`, message types, **Budget Guard** primitives, and pricing tables.

## Install

```bash
npm install @ziro-agent/core
```

## Quick start

```ts
import { generateText } from '@ziro-agent/core';
import { createOpenAI } from '@ziro-agent/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Write a haiku about TypeScript.',
});
```

## Budget Guard (v0.1.4 — single call; v0.1.5 — agent loop, tools, OTel)

`Budget Guard` enforces token, cost, call-count, and wall-clock budgets at the SDK call site — throwing `BudgetExceededError` **before** an over-budget request is sent to the model. See [RFC 0001](../../rfcs/0001-budget-guard.md) for the full design.

For agent-loop and per-tool budgets, see `@ziro-agent/agent` (`createAgent({ budget, toolBudget })` + `onExceed: 'truncate'`) and `@ziro-agent/tools` (`defineTool({ budget })`). For OpenTelemetry observability of the budget lifecycle, see `@ziro-agent/tracing`'s `instrumentBudget()`.

### Single call

```ts
import { generateText, BudgetExceededError } from '@ziro-agent/core';
import { createOpenAI } from '@ziro-agent/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });

try {
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt: 'Summarise the attached doc',
    budget: {
      maxUsd: 0.10,
      warnAt: { pctOfMax: 80 },
    },
  });
} catch (err) {
  if (err instanceof BudgetExceededError) {
    console.warn(
      `Aborted before spend: ${err.kind} > ${err.limit} (observed ${err.observed})`,
      err.partialUsage,
    );
    return notifyOpsAndFallbackToCheaperModel(err);
  }
  throw err;
}
```

### Composing budgets across nested calls

`withBudget(spec, fn)` opens an `AsyncLocalStorage`-backed scope. Any nested `generateText`, `streamText`, or future `agent.run` call within `fn` inherits and intersects with the parent scope (the tighter limit wins).

```ts
import { withBudget, generateText, getCurrentBudget } from '@ziro-agent/core';

await withBudget({ maxUsd: 5.0, maxLlmCalls: 50 }, async () => {
  await generateText({ model, prompt: 'Step 1' });
  await generateText({ model, prompt: 'Step 2', budget: { maxUsd: 0.5 } });
  // Inner spec intersects with the outer: child max = min(0.5, 5.0 - already_spent).

  const ctx = getCurrentBudget();
  console.log(`Remaining: $${ctx?.remaining.usd?.toFixed(4)}`);
});
```

### Pricing data

Pricing for the supported OpenAI / Anthropic models lives at `@ziro-agent/core/pricing`:

```ts
import { getPricing, costFromUsage } from '@ziro-agent/core/pricing';

const pricing = getPricing('openai', 'gpt-4o-mini');
const usd = costFromUsage(pricing!, { promptTokens: 1200, completionTokens: 300 });
```

Provider adapters (`@ziro-agent/openai`, `@ziro-agent/anthropic`) implement the optional `LanguageModel.estimateCost(options)` method on top of this table for accurate pre-flight bounds. Third-party providers don't need to implement `estimateCost` — Budget Guard falls back to the same pricing table + a character-based token heuristic.

### Error shape

```ts
class BudgetExceededError extends ZiroError {
  readonly kind: 'usd' | 'tokens' | 'llmCalls' | 'steps' | 'duration';
  readonly limit: number;
  readonly observed: number;
  readonly scopeId: string;       // for trace correlation
  readonly partialUsage: BudgetUsage;
  readonly preflight: boolean;     // true = thrown BEFORE the network call
}
```

`preflight: true` is the canonical "no overspend" guarantee — the call was refused before any tokens were billed. `preflight: false` means the actual usage from a completed call crossed the limit; tokens are billed but the SDK refuses to issue any further calls within the scope.

## License

Apache-2.0
