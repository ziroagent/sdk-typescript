# `@ziro-agent/middleware`

> Built-in [`LanguageModelMiddleware`](../core/src/types/middleware.ts) for the [ZiroAgent SDK](../../README.md). Compose retry, caching, and other production-safety primitives onto any `LanguageModel` via [`wrapModel()`](../core/src/util/wrap-model.ts).

```bash
npm install @ziro-agent/middleware @ziro-agent/core
```

## Why a middleware layer?

Production agents need cross-cutting behaviour — retries on 503, caching for graders, PII redaction before egress, structured-output post-processing — that has **nothing to do with which provider you're using**. Middleware lets you write that logic **once** and apply it to OpenAI, Anthropic, Ollama, or your own custom `LanguageModel` interchangeably.

The contract is three optional hooks (see [RFC 0005](../../rfcs/0005-language-model-middleware.md)):

```ts
interface LanguageModelMiddleware {
  transformParams?(args): ModelCallOptions | Promise<ModelCallOptions>;
  wrapGenerate?(ctx): Promise<ModelGenerateResult>;
  wrapStream?(ctx): Promise<ReadableStream<ModelStreamPart>>;
}
```

## Quick start

```ts
import { openai } from '@ziro-agent/openai';
import { wrapModel } from '@ziro-agent/core';
import { retry, cache } from '@ziro-agent/middleware';

const robust = wrapModel(openai('gpt-4o-mini'), [
  retry({ maxAttempts: 4 }),    // outer: retries on 5xx / 429
  cache({ ttlMs: 60_000 }),     // inner: returns cached result on identical params
]);

// Drop into createAgent / generateText — same LanguageModel surface.
```

Order matters: `middleware[0]` is the **outermost** wrapper. In the example above a cache hit short-circuits BEFORE retry observes anything.

## Built-ins

### `retry(options)`

Re-issues `doGenerate()` / `doStream()` on transient failures, with full-jittered exponential backoff.

```ts
retry({
  maxAttempts: 3,        // default
  baseDelayMs: 200,
  maxDelayMs: 30_000,
  isRetryable: (err) => err instanceof APICallError && err.isRetryable,  // default
  onRetry: ({ attempt, delayMs, error }) => log.warn({ attempt, delayMs }, error),
});
```

- Default `isRetryable`: any [`APICallError`](../core/src/errors.ts) whose `isRetryable` is true (covers 408, 409, 429, 5xx, and network errors with no status).
- Cooperates with `params.abortSignal`: a fired signal aborts the in-flight backoff sleep immediately.
- `wrapStream` retries ONLY when `doStream()` rejects BEFORE returning the stream — once chunks are flowing we cannot replay without losing emitted text.

### `cache(options)`

Short-circuits `wrapGenerate` with a previously-stored response when the same `ModelCallOptions` arrive again. Streaming is intentionally NOT cached.

```ts
cache({
  store: new MemoryCacheStore(),  // default; swap for Redis/SQLite/etc.
  ttlMs: 60_000,
  keyOf: (params, model) => /* custom strategy */,
  onEvent: ({ hit, key }) => metrics.inc(hit ? 'cache.hit' : 'cache.miss'),
});
```

The default cache key includes `provider`, `modelId`, the full message array, tool definitions, and every sampling option (`temperature`, `topP`, `topK`, `maxTokens`, `stopSequences`, `seed`, `providerOptions`). `headers` and `abortSignal` are deliberately ignored.

**Use the cache for deterministic prompts only** — graders, embeddings, structured-output extraction. NEVER for user-facing chat: even `temperature=0` is not a guaranteed-deterministic contract from any provider.

#### Custom store

```ts
import type { CacheStore } from '@ziro-agent/middleware';

class RedisCache implements CacheStore {
  async get(key) { /* ... */ }
  async set(key, value, ttlMs) { /* ... */ }
}

cache({ store: new RedisCache() });
```

## Writing your own middleware

```ts
import type { LanguageModelMiddleware } from '@ziro-agent/core';

export const auditLog: LanguageModelMiddleware = {
  middlewareId: 'audit/log',
  async wrapGenerate({ doGenerate, model, params }) {
    const start = Date.now();
    try {
      const result = await doGenerate();
      log.info({ provider: model.provider, modelId: model.modelId, ms: Date.now() - start });
      return result;
    } catch (err) {
      log.error({ err, ms: Date.now() - start });
      throw err;
    }
  },
};
```

Tips:
- Implement only the hooks you need — missing hooks are skipped automatically.
- For per-chunk inspection in streams, use a `TransformStream` rather than buffering — middleware should preserve incremental delivery.
- Set `middlewareId` for nicer error messages and traces.

## Status

- **Stable**: `wrapModel`, `retry`, `cache`.
- **Coming next** (planned in [RFC 0005](../../rfcs/0005-language-model-middleware.md) §built-ins):
  - `redactPII()` — strip emails, credit cards, phone numbers from `params.messages` before egress.
  - `blockPromptInjection()` — heuristic + classifier-based gate against override attacks.
  - `structuredOutput(schema)` — Zod-validated post-processing with a single retry on schema failure.

Open an issue or RFC if your team needs one of these sooner.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
