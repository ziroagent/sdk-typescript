# RFC 0001: BudgetGuard — first-class cost enforcement

- Start date: 2026-04-19
- Authors: @ziro-agent/maintainers
- Status: **accepted (v0.1.6)** — layers 1+2+3+4 all shipped 2026-04-20 (`core` + provider `estimateCost`; `agent` loop budget, `tools` per-tool `budget` + `getCurrentBudget`, `tracing` `instrumentBudget()`; streaming mid-call abort + `onExceed` function form + pricing-drift CI). Durable execution + gateway integrations tracked for v0.2/v0.3.
- Affected packages: `@ziro-agent/core`, `@ziro-agent/agent`, `@ziro-agent/tools`, `@ziro-agent/tracing`, `@ziro-agent/gateway`

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

### Core types (in `@ziro-agent/core`)

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

This requires per-provider pricing tables, kept in `@ziro-agent/core/pricing` and updated weekly via a scheduled CI job (see also: `pricing-table.json` schema in §Adoption).

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
import { getCurrentBudget } from '@ziro-agent/core';

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

These integrate with the standard `@ziro-agent/tracing` exporter and are visible in the playground's trace timeline.

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

### Rollout plan (revised against actual ship history)

| Stage | Status | Package | What ships |
| --- | --- | --- | --- |
| v0.1.4 | ✅ shipped | `@ziro-agent/core` | `BudgetSpec`, `BudgetExceededError`, `withBudget`, `getCurrentBudget`, `generateText({ budget })`, `streamText({ budget })`, `@ziro-agent/core/pricing` subpath |
| v0.1.4 | ✅ shipped | `@ziro-agent/openai`, `@ziro-agent/anthropic` | optional `estimateCost()` on `LanguageModel`; pricing tables consumed via `@ziro-agent/core/pricing` |
| v0.1.5 | ✅ shipped | `@ziro-agent/core` | `BudgetObserver` + `setBudgetObserver()` (internal-stable hook for tracing); `intersectSpecs` re-exported for tool layer use |
| v0.1.5 | ✅ shipped | `@ziro-agent/agent` | `agent.run({ budget, toolBudget })`; AsyncLocalStorage context flows through the loop; `BudgetSpec.onExceed: 'truncate'`; `AgentRunResult.finishReason: 'budgetExceeded'`; `budget-exceeded` step event |
| v0.1.5 | ✅ shipped | `@ziro-agent/tools` | `defineTool({ budget })`; `executeToolCalls({ toolBudget })`; per-tool `BudgetExceededError` captured as `ToolExecutionResult.budgetExceeded`; `getCurrentBudget()` re-exported for tool authors |
| v0.1.5 | ✅ shipped | `@ziro-agent/tracing` | `instrumentBudget()` bridges `BudgetObserver` into OTel: `ziro.budget.scope` span + `usage.update`/`warning`/`exceeded` events; new `ziroagent.budget.*` attribute keys |
| v0.1.6 | ✅ shipped | `@ziro-agent/core` | `streamText({ budget })` mid-call abort via budget-aware reader + chained `AbortController` (resolves §Unresolved Q4); `BudgetSpec.onExceed` function form wired into `generateText`/`streamText`/`agent.run` at the scope-owning layer; `checkMidStream`, `applyResolution`, `resolveOnExceed` primitives; aggregate stream promises (`text()`/`finishReason()`/`usage()`/`toolCalls()`) now reject on stream error instead of hanging |
| v0.1.6 | ✅ shipped | `@ziro-agent/agent` | `agent.run({ budget: { onExceed: fn } })` returns the resolver's `replacement` (typed as `AgentRunResult`); resolver-thrown errors surface with the original budget error attached as `cause` |
| v0.1.6 | ✅ shipped | infra | `scripts/check-pricing-drift.ts` + `.github/workflows/pricing-drift.yml`: weekly cron + on-PR run; warn-only annotation on PRs (drift is a reminder, not a blocker); scheduled drift opens / refreshes a `pricing-drift` tracking issue. Live HTML scraping deferred — gated on selecting a strategy that survives provider page restyles. |
| v0.2.x | ✅ shipped | `@ziro-agent/eval` | `costBudget` grader (`packages/eval/src/graders/cost-budget.ts`) — asserts `budgetUsage` / spend caps on eval runs |
| v0.1.x | ✅ shipped | `@ziro-agent/agent` | One-time `process.emitWarning` on first top-level `agent.run()` without `budget` when no outer `getCurrentBudget()` (RFC §Unresolved Q1); suppressed when `VITEST=true` or `ZIRO_SUPPRESS_UNCAPPED_BUDGET_WARN=1` |
| v0.2.0 | planned | `@ziro-agent/temporal`, `@ziro-agent/inngest` | Budget state persistence on crash/resume |
| v0.3.0 | planned | `@ziro-agent/gateway` | Per-virtual-key budget enforcement |

#### v0.1.4 ship notes (2026-04-20)

- `LanguageModel.estimateCost` is **optional**. When absent, `generateText({ budget })` falls back to the SDK's `@ziro-agent/core/pricing` table + character-based token heuristic — third-party providers don't need any code change to opt in.
- `BudgetSpec.onExceed` ships with `'throw'` semantics in v0.1.4. `'truncate'` and the function form land with the agent integration in v0.1.5 (only meaningful at the loop layer).
- `BudgetSpec.maxSteps` is in the type but ignored by `generateText` (single-call layer). Documented as such; enforced once `agent.run` consumes the same scope.
- Pricing data is hand-maintained in `packages/core/src/pricing/data.ts`; the scheduled drift-detection Action is tracked as a follow-up issue.
- Stream mid-call abort on overrun (RFC §Unresolved Q4) is intentionally deferred to v0.1.6; v0.1.4 enforces pre-flight before the stream opens and post-call once `usage()` resolves.

#### v0.1.5 ship notes (2026-04-20)

- **`onExceed: 'truncate'`** at the agent layer returns an `AgentRunResult` with `finishReason: 'budgetExceeded'` and a populated `budgetExceeded` field (`{ kind, limit, observed, scopeId, partialUsage, origin }`). Default is still `'throw'` — existing callers see no behaviour change.
- **Tool budgets compose via `intersectSpecs(toolBudget, tool.budget)`**, then the resulting spec passes through `withBudget` which intersects again with the surrounding agent scope. Net result: the tightest constraint always wins, matching RFC §"How budgets compose".
- **`BudgetExceededError` thrown inside a tool is converted to `ToolExecutionResult.budgetExceeded`** rather than re-raised, so a single rogue tool can't crash the agent loop. The agent then promotes the first such tool result back into a budget halt (see `AgentBudgetExceededInfo.origin === 'tool'`).
- **`maxSteps` enforcement**: when both `CreateAgentOptions.maxSteps` and `BudgetSpec.maxSteps` are set, `agent.run` takes the minimum. `finishReason` is `'maxSteps'` (not `'budgetExceeded'`) when a step cap stops the loop — `'budgetExceeded'` is reserved for hard usage/duration overruns.
- **Tracing observer is internal-stable**. `setBudgetObserver()` is exported but the docs explicitly mark it as "for instrumentation packages, not end users". Only one observer can be active; `instrumentBudget()` returns the previous observer for chaining.
- **Mid-tool-execution abort still deferred**. Budget enforcement runs *between* tool calls and *between* nested LLM calls inside a tool — a long-running tool that holds a connection open will not be interrupted mid-call. Tracked for v0.1.6 alongside the stream mid-call abort work.
- **`process.emitWarning` kept for back-compat**. v0.1.5 fires both `process.emitWarning` AND the observer hook on `warnAt` — users without `instrumentBudget()` still see the same Node warnings as v0.1.4.

#### v0.1.6 ship notes (2026-04-20)

- **Streaming mid-call abort lands.** `streamText({ budget })` wraps the provider stream in a budget-aware reader. Per `text-delta` it accumulates a chars/4 completion-token estimate and runs `checkMidStream(scope, projectedTokens, projectedUsd)` against the projected total (`inputTokensEstimate + accumulatedCompletion`). On overrun it errors the wrapper stream with `BudgetExceededError`, calls `internalAC.abort(err)` (chained into `ModelCallOptions.abortSignal` so providers respecting the signal tear down their socket), and fire-and-forget cancels the source reader. The chars/4 heuristic over-estimates ~5–10% — that's the right direction (false-positive abort costs nothing, false-negative costs real money).
- **`onExceed` function form is layer-scoped, not call-scoped.** The resolver only fires at the layer that **owns** the scope (the layer that passed `budget`). When `generateText` is invoked inside an outer `withBudget` (e.g. via `agent.run({ budget })`), `BudgetExceededError` propagates up so the agent layer's resolver gets a chance to interpret it — this avoids the footgun where a user's resolver returns an `AgentRunResult` shape but the inner `generateText` tries to use it as a `GenerateTextResult`.
- **Replacement values are unchecked at runtime.** `BudgetResolution.replacement` is typed as `unknown`; the SDK casts it to the calling function's result type. Type-parameterized `BudgetResolution<T>` is a v0.2 follow-up.
- **Resolver-thrown errors propagate (with `cause`)**. If the user's resolver itself throws, that error is re-raised with `error.cause = originalBudgetExceededError` — the original budget error is never silently lost.
- **Aggregate stream-promise hang fix.** Pre-v0.1.6, `r.usage()`/`r.finishReason()`/`r.toolCalls()` would hang forever when the underlying stream errored (only `r.text()` rejected). v0.1.6 rejects all four on stream error and pre-attaches a noop `.catch` to each so an early rejection doesn't show up as an unhandled rejection on Node.
- **Pricing drift CI is `validFrom`-only for now.** The script parses `packages/core/src/pricing/data.ts` (no `eval`) and warns on entries older than `STALENESS_DAYS` (default 60). Live page scraping is deferred — see "infra" row of the adoption table.

### Pricing-table format (`@ziro-agent/core/pricing`)

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

1. **Should `budget` be required (not optional) on `agent.run`?** Strong argument for safety-by-default ("if you don't pass budget, you opted in to unlimited spend, here be dragons"). Counter-argument: friction for prototyping. **Shipped (v0.1.x)**: `budget` stays optional, but the first top-level uncapped `agent.run` per process emits a one-time `process.emitWarning` (`code: ZIRO_UNCAPPED_AGENT_BUDGET`) when there is no outer budget context; suppressed under Vitest (`VITEST=true`) or when `ZIRO_SUPPRESS_UNCAPPED_BUDGET_WARN=1`. **Still tentative for v1.0**: may flip to required or stricter defaults.
2. **Reasoning-token visibility.** o1 / o3 / claude-thinking models hide reasoning tokens. How should `estimateCost` handle these? **Tentative answer**: pessimistic estimate (assume reasoning tokens = output tokens × 4 for thinking models), document clearly, allow override.
3. **Multi-currency support.** Some Asian customers want VND/IDR/THB display. **Tentative answer**: USD-only internally; localized display only at presentation layer (CLI, playground). Defer to v0.3.
4. **Budget for streaming partial results.** When `generateText` is streaming and budget runs out mid-stream, do we abort the connection or finish the current SSE chunk? **Resolved (v0.1.6)**: abort immediately on the chunk that trips the projection. `streamText` errors the wrapper stream with `BudgetExceededError` and aborts the underlying HTTP request via a chained `AbortController`. Consumers that already drained earlier chunks keep them; `r.text()` / `for await` reject on the next read. `partialText` is intentionally NOT attached to the error — partial output is observable by holding onto the chunks the consumer already received (the rejection itself only carries `partialUsage`).
5. **How to handle MCP-server tools where we can't predict cost?** **Tentative answer**: MCP tools have an implicit `unknown` cost; users must declare `budget` on them explicitly to enforce; otherwise excluded from estimation but counted post-hoc.

---

*Discussion welcome. Comment via PR review or open an issue with the `rfc-0001` label. Target acceptance: 2 weeks from draft date.*
