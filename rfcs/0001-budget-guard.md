# RFC 0001: BudgetGuard — first-class cost enforcement

- Start date: 2026-04-19
- Authors: @ziroagent/maintainers
- Status: draft
- Affected packages: `@ziroagent/core`, `@ziroagent/agent`, `@ziroagent/tools`, `@ziroagent/gateway`

## Summary

Introduce `BudgetGuard` — a first-class primitive that enforces token, cost, and step budgets **at the SDK call site**, throwing `BudgetExceededError` *before* an over-budget request is sent to the model. Budgets compose through agent loops and workflow nodes via an `AsyncLocalStorage`-backed context, so a `maxUsdPerRun` set on `agent.run({...})` automatically constrains every nested `generateText`, tool call, and sub-agent.

This is the production-safety primitive #1 of Ziro's roadmap (see [`STRATEGY.md`](../STRATEGY.md) §3, §4.2).

## Motivation

Documented production incidents from the 2026 AI Agent Incident Report:

- $0.80 model run triggered $50K+ pipeline damage via runaway tool calls.
- $1.40 run caused $50K+ damage in another documented case.
- $12,400 in a single agent run from a retry loop (cited in our README hook).
- Mean per-execution cost variance: 1,000–25,000 tokens on the same endpoint.

Existing TypeScript SDKs handle this either:

1. **Not at all** (Vercel AI SDK, Mastra core) — user must instrument manually.
2. **At the gateway layer only** (LiteLLM, Kong AI Gateway) — budget enforcement happens *after* the SDK has already issued the request, too late for try/catch in user code.

Neither approach lets a developer write:

```ts
try {
  await agent.run({ prompt, budget: { maxUsdPerRun: 2.00 } });
} catch (e) {
  if (e instanceof BudgetExceededError) {
    notifyOpsAndFallbackToCheaperModel(e);
  }
}
```

…which is the most common production-safety pattern requested by our design partners. RFC 0001 makes this idiomatic.

## Detailed design

### Core types (in `@ziroagent/core`)

```ts
export interface BudgetSpec {
  /** Hard ceiling in USD for the entire scope. Throws BudgetExceededError when crossed. */
  maxUsd?: number;
  /** Hard ceiling in input + output tokens. */
  maxTokens?: number;
  /** Max total LLM calls within scope (agent step ≠ LLM call). */
  maxLlmCalls?: number;
  /** Max agent steps (including tool calls + reasoning). Only meaningful for agent.run. */
  maxSteps?: number;
  /** Wall-clock timeout in milliseconds for the entire scope. */
  maxDurationMs?: number;
  /**
   * Soft warning thresholds. When crossed, emits a `budget.warning` OTel event
   * but does NOT throw. Useful for paging Ops before things blow up.
   */
  warnAt?: { usd?: number; tokens?: number; pctOfMax?: number };
  /**
   * Behavior when the budget is exceeded.
   * - `throw` (default): synchronously throw BudgetExceededError before next call.
   * - `truncate`: return whatever has been generated so far + a usage warning.
   * - `fallback`: invoke the configured `onExceed` handler (e.g., switch to a cheaper model).
   */
  onExceed?: 'throw' | 'truncate' | ((ctx: BudgetContext) => Promise<BudgetResolution>);
}

export class BudgetExceededError extends ZiroError {
  readonly kind: 'usd' | 'tokens' | 'llmCalls' | 'steps' | 'duration';
  readonly limit: number;
  readonly observed: number;
  readonly scopeId: string;        // for trace correlation
  readonly partialUsage: Usage;     // what was spent before the throw
}

export interface BudgetContext {
  readonly spec: BudgetSpec;
  readonly used: Usage;             // current accumulator
  readonly remaining: Usage;
  readonly scopeId: string;
}
```

### How budgets compose

Budgets are tracked in a per-scope context held in `AsyncLocalStorage` (Node) / equivalent on Edge runtimes. When a scope nests another scope, the **child inherits and intersects** with the parent:

```ts
// Outer budget: $5.00 total
await agent.run({
  prompt: 'Triage this ticket',
  budget: { maxUsdPerRun: 5.00 },
  // Inner: each tool call max $0.50 — but ALSO can't exceed remaining outer budget
  toolBudget: { maxUsdPerCall: 0.50 },
});
```

If the agent has spent $4.80 and the next tool call would cost $0.50, the **outer** limit triggers first — `BudgetExceededError({ kind: 'usd', limit: 5.00, observed: 5.30 })`.

### Pre-flight estimation

Every provider adapter must implement:

```ts
interface LanguageModel {
  // ... existing methods
  estimateCost(req: GenerateRequest): Promise<{ minUsd: number; maxUsd: number; minTokens: number; maxTokens: number }>;
}
```

Before sending a request, the SDK calls `estimateCost`. If `currentUsage.usd + estimate.minUsd > budget.maxUsd`, the SDK throws **without making the network call** (the canonical "throw before overspend" guarantee).

This requires per-provider pricing tables, kept in `@ziroagent/core/pricing` and updated weekly via a scheduled CI job (see also: `pricing-table.json` schema in §Adoption).

### API surface

#### On a single LLM call

```ts
await generateText({
  model: openai('gpt-4o'),
  prompt: '...',
  budget: { maxUsd: 0.10, warnAt: { usd: 0.07 } },
});
```

#### On an agent run

```ts
await agent.run({
  prompt: '...',
  budget: { maxUsdPerRun: 5.00, maxSteps: 20, maxDurationMs: 5 * 60_000 },
  toolBudget: { maxUsdPerCall: 0.50 },         // applies per individual tool call
});
```

#### On a tool definition (declared budget)

```ts
const expensiveSearch = defineTool({
  name: 'webSearch',
  description: 'Searches the web. Expensive.',
  input: z.object({ query: z.string() }),
  budget: { maxUsd: 0.20, maxDurationMs: 10_000 },  // per-invocation default
  execute: async ({ query }) => { /* ... */ },
});
```

A tool's declared budget is **min(tool.budget, parent.toolBudget, parent.budget.remaining)**.

#### Inspecting budget state from inside a tool

```ts
import { getCurrentBudget } from '@ziroagent/core';

execute: async (input, ctx) => {
  const budget = getCurrentBudget();
  if (budget.remaining.usd < 0.05) {
    return { abridged: true, reason: 'low budget — returning summary only' };
  }
  // ... full execution
}
```

### Observability (OTel integration)

Every budget scope emits the following spans/events:

| Event | When | Attributes |
| --- | --- | --- |
| `ziro.budget.scope.start` | Scope entered | `scope_id`, `spec` |
| `ziro.budget.usage.update` | After each LLM/tool call | `usage`, `remaining` |
| `ziro.budget.warning` | `warnAt` threshold crossed | `kind`, `observed`, `threshold` |
| `ziro.budget.exceeded` | Hard limit hit | `kind`, `limit`, `observed`, `partial_usage` |
| `ziro.budget.scope.end` | Scope exits cleanly or via throw | `final_usage`, `outcome` |

These integrate with the standard `@ziroagent/tracing` exporter and are visible in the playground's trace timeline.

### Interaction with `DurableRuntime` (forward compat with RFC 0002)

When an agent runs under a `DurableRuntime` (Temporal/Inngest/Restate, RFC 0002), budget state is **persisted with the run state**. After a crash + resume, the budget accumulator is restored — preventing the "crash → resume → ignores already-spent $4.50" footgun.

## Drawbacks

- **Pricing-table maintenance burden.** Provider pricing changes (sometimes weekly). We need automated drift detection + a pricing-update CI workflow. Mitigation: scheduled job + community PR template.
- **Estimation accuracy.** Pre-flight estimates can be wrong (variable response length, hidden reasoning tokens for o1/o3-style models). Mitigation: estimate uses upper-bound (`maxTokens`) for safety; document this clearly; provide `estimationMode: 'optimistic' | 'pessimistic'`.
- **AsyncLocalStorage cost on Edge.** Some Edge runtimes have limited or absent ALS support. Mitigation: explicit `withBudget(spec, fn)` API as fallback; the implicit ALS form is opt-in via `setGlobalBudgetMode('implicit')`.
- **API surface area expansion.** Adds `budget`, `toolBudget`, `BudgetExceededError`, `getCurrentBudget`, `withBudget`, `pricing` exports. Mitigation: all opt-in; no budget = no enforcement = same behavior as today.

## Alternatives

### Alternative A: gateway-layer-only enforcement (status quo for LiteLLM/Kong)

**Rejected.** Cannot throw synchronously to user code; cannot enforce per-tool-call budgets within an agent loop; requires a separate gateway deployment.

### Alternative B: middleware/interceptor pattern (Express-style)

```ts
agent.use(budgetMiddleware({ maxUsd: 5.00 }));
```

**Rejected as primary API** because middleware ordering bugs are a classic source of production incidents. We may expose middleware as a power-user escape hatch in v0.3 once the primary API is proven.

### Alternative C: post-hoc reporting only (no enforcement)

Provide cost in the result object, let user check after the fact. **Rejected** because by the time the user sees the cost, the money is already spent — defeats the purpose.

### Alternative D: token-only budgets, no USD

Some teams will argue tokens are more stable than USD. **Rejected** as the primary unit because (a) USD is what finance teams care about, (b) we want comparison across providers (1000 Claude tokens ≠ 1000 GPT tokens in $$$), (c) we still expose `maxTokens` for users who prefer it.

## Adoption strategy

This is **additive and opt-in**. Existing Ziro v0.0.x users see no behavioral change unless they pass `budget`.

### Rollout plan

| Stage | Package | What ships |
| --- | --- | --- |
| v0.1.0 | `@ziroagent/core` | `BudgetSpec`, `BudgetExceededError`, `withBudget`, `generateText({ budget })` |
| v0.1.0 | `@ziroagent/openai`, `@ziroagent/anthropic` | `estimateCost()` + pricing tables |
| v0.1.1 | `@ziroagent/agent` | `agent.run({ budget, toolBudget })`, AsyncLocalStorage context |
| v0.1.2 | `@ziroagent/tools` | `defineTool({ budget })`, `getCurrentBudget()` helper |
| v0.1.x | `@ziroagent/tracing` | OTel events `ziro.budget.*` |
| v0.2.0 | `@ziroagent/eval` | `cost-budget` grader for eval suite |
| v0.2.0 | `@ziroagent/temporal`, `@ziroagent/inngest` | Budget state persistence on crash/resume |
| v0.3.0 | `@ziroagent/gateway` | Per-virtual-key budget enforcement |

### Pricing-table format (`@ziroagent/core/pricing`)

```jsonc
{
  "openai/gpt-4o": {
    "input_per_1m_usd": 2.50,
    "output_per_1m_usd": 10.00,
    "cached_input_per_1m_usd": 1.25,
    "valid_from": "2026-04-01"
  },
  // ...
}
```

A scheduled GitHub Action will:
1. Pull latest pricing from each provider's published API or scraped pricing page.
2. Open a PR if drift detected.
3. Block merge of provider releases if pricing table is stale (>30 days).

### Migration

Not applicable — this is a new feature in v0.1. No existing users to migrate.

### Documentation deliverables alongside ship

- Cookbook: *"Stopping a runaway agent — three patterns with `BudgetGuard`"*
- Cookbook: *"Graceful degradation: fallback to a cheaper model when budget is tight"*
- Reference docs for every type/method
- Trace teardown video showing a `BudgetExceededError` in the playground

## Unresolved questions

1. **Should `budget` be required (not optional) on `agent.run`?** Strong argument for safety-by-default ("if you don't pass budget, you opted in to unlimited spend, here be dragons"). Counter-argument: friction for prototyping. **Tentative answer**: optional in v0.1, but emit a console warning on first uncapped run per process; revisit for v1.0.
2. **Reasoning-token visibility.** o1 / o3 / claude-thinking models hide reasoning tokens. How should `estimateCost` handle these? **Tentative answer**: pessimistic estimate (assume reasoning tokens = output tokens × 4 for thinking models), document clearly, allow override.
3. **Multi-currency support.** Some Asian customers want VND/IDR/THB display. **Tentative answer**: USD-only internally; localized display only at presentation layer (CLI, playground). Defer to v0.3.
4. **Budget for streaming partial results.** When `generateText` is streaming and budget runs out mid-stream, do we abort the connection or finish the current SSE chunk? **Tentative answer**: abort immediately; expose `partialText` on the thrown error.
5. **How to handle MCP-server tools where we can't predict cost?** **Tentative answer**: MCP tools have an implicit `unknown` cost; users must declare `budget` on them explicitly to enforce; otherwise excluded from estimation but counted post-hoc.

---

*Discussion welcome. Comment via PR review or open an issue with the `rfc-0001` label. Target acceptance: 2 weeks from draft date.*
