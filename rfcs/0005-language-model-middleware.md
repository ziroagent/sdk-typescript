# RFC 0005: `LanguageModelMiddleware` — composable model wrappers

- Start date: 2026-04-22
- Authors: @ziro-agent/maintainers
- Status: **draft (stub)** — design comments open per `GOVERNANCE.md` until 2026-05-06
- Affected packages: `@ziro-agent/core`, **new** `@ziro-agent/middleware`
- Tracks: v0.2 Track 1 (RFC 0004)

## Summary

Introduce a `LanguageModelMiddleware` interface in `@ziro-agent/core` plus a
`wrapModel(model, middleware[])` helper, modelled on the Vercel AI SDK v3-spec
pattern. Ship a new `@ziro-agent/middleware` package with the four
production-critical middlewares — `retry()`, `cache()`, `redactPII()`,
`blockPromptInjection()` — and reuse the existing `instrumentModel()` tracing
so middleware spans nest under model spans.

This single primitive subsumes four separate v0.2 line-items from the original
roadmap (PII redaction, prompt-injection guard, retry/backoff, cost-tracking
middleware) and unblocks the *gateway* story without standing up a separate
daemon.

## Motivation

The RFC 0004 competitive review surfaced one pattern that recurs across Vercel
AI SDK, Mastra, OpenAI Agents JS, and LangGraph: **wrap the model, not the
agent**. Wrapping the model lets the same middleware apply to `generateText`,
`streamText`, eval cases, and agent loops uniformly — without each composition
primitive learning about middleware separately.

Production needs we keep getting design-partner asks for:

- **Retry** with exponential backoff that respects `APICallError.isRetryable`
  (already available on our error class).
- **Semantic / exact cache** for repeated `streamText` calls — Mastra users cite
  60-90% cost reduction on idempotent workflows.
- **PII redaction** before tokens leave the process — required for VN/SEA
  banking design partners and for SOC 2.
- **Prompt-injection guard** as a pre-flight check — Lakera adapter, plus a
  heuristic fallback for offline mode.
- **Cost tagging** — emit `OTel` attributes with budget-scope context for
  per-tenant chargeback.

Without a middleware abstraction, each of these ships as a bespoke API on
`generateText` or as a wrapper class, fragmenting the codebase.

## Detailed design (sketch — to be expanded)

### Interface

```ts
export interface LanguageModelMiddleware {
  readonly middlewareVersion?: '1';

  transformParams?: (
    args: { type: 'generate' | 'stream'; params: LanguageModelCallOptions },
  ) => PromiseLike<LanguageModelCallOptions> | LanguageModelCallOptions;

  wrapGenerate?: (args: {
    doGenerate: () => PromiseLike<GenerateResult>;
    doStream: () => PromiseLike<StreamResult>;
    params: LanguageModelCallOptions;
    model: LanguageModel;
  }) => PromiseLike<GenerateResult>;

  wrapStream?: (args: {
    doGenerate: () => PromiseLike<GenerateResult>;
    doStream: () => PromiseLike<StreamResult>;
    params: LanguageModelCallOptions;
    model: LanguageModel;
  }) => PromiseLike<StreamResult>;
}

export function wrapModel(
  model: LanguageModel,
  middleware: LanguageModelMiddleware | LanguageModelMiddleware[],
): LanguageModel;
```

Composition order: outermost middleware wraps innermost. `wrapModel(m, [a, b])`
means `a` sees the call first, `b` sees it second, and both see the result on
the way back out — same semantics as Koa / express middleware.

### Built-in middlewares (`@ziro-agent/middleware`)

```ts
retry({ maxAttempts: 3, initialDelayMs: 250, maxDelayMs: 8_000 });
cache({ adapter: lru({ max: 1_000 }) });
cache({ adapter: redis(url), keyBy: ({ params }) => hash(params) });
redactPII({ adapter: presidio(), entities: ['EMAIL', 'PHONE_NUMBER'] });
blockPromptInjection({ adapter: lakera(apiKey), heuristic: true });
```

### Tracing

Every middleware execution emits a span `ziro.middleware.<name>` nested under
the existing `ziro.model.<provider>` span produced by `instrumentModel()`. No
new exporter; all OTel-conforming.

### Budget-guard interaction

`cache()` hits do **not** consume budget — `BudgetGuard` is wired by emitting
`zero-cost` usage when a cached response is returned, with a span attribute
`ziro.cache.hit = true`. `BudgetExceededError` still throws on misses.

## Drawbacks

- One more abstraction surface to learn. Mitigation: built-in middlewares cover
  90% of asks; advanced users only touch the interface.
- Middleware composition order can surprise users (see Koa middleware bugs in
  the wild). Mitigation: ship a `printMiddlewareChain(model)` debug helper.
- Risk of becoming a kitchen-sink pkg. Mitigation: anti-roadmap entry — only 4
  middlewares ship in `@ziro-agent/middleware`; everything else is contributed
  via the docs cookbook with no `@ziro-agent` namespace.

## Alternatives

- **Per-feature flags on `generateText`** (e.g. `generateText({ retry: {...} })`).
  Rejected: doesn't compose, doesn't apply uniformly to `streamText` or agent
  loops.
- **Wrapper classes** (`new RetryingModel(model, opts)`). Rejected: combinator
  hell at 3+ layers, no introspection.
- **Adopt `ai`'s exact `wrapLanguageModel`** verbatim. Rejected: couples us to
  Vercel AI SDK V-major versioning, contradicts RFC 0004 anti-roadmap entry on
  `LanguageModelV3` type leakage.

## Adoption strategy

- New API; non-breaking. `wrapModel(model, [])` is a no-op.
- v0.1.x users: model definitions unchanged. Add middleware lazily.
- Migration cookbook: replace `new RetryingModel(...)` patterns from user
  code with `wrapModel(model, [retry()])`.

## Unresolved questions

- **Async middleware composition cost.** Bench target: <0.5ms overhead per
  call for a 4-middleware stack on a no-op model.
- **Cache key derivation.** Default to deterministic `hash(params)` — should
  we expose a `keyBy` callback day one or punt to v0.2.1?
- **PII redaction reversibility.** Do we ship a `restorePII` post-processor
  for the response, or is one-way redaction the right default?
- **Middleware ordering for HITL.** If `requiresApproval` is on a tool,
  middleware sits *between* the LLM call and the tool dispatch — confirm no
  middleware sees the tool result before approval resolves.
