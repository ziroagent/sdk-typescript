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
import { blockPromptInjection, cache, redactPII, retry } from '@ziro-agent/middleware';

const robust = wrapModel(openai('gpt-4o-mini'), [
  blockPromptInjection(),                                  // outermost: fail fast on attacks
  redactPII({ entities: ['EMAIL', 'PHONE_NUMBER'] }),      // strip PII BEFORE the cache key
  cache({ ttlMs: 60_000 }),                                // hits short-circuit before retry
  retry({ maxAttempts: 4 }),                               // innermost: closest to the wire
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

### `redactPII(options)`

Replaces common PII tokens (`EMAIL`, `PHONE_NUMBER`, `SSN`, `CREDIT_CARD`, `IP_ADDRESS`, `IBAN`) in outbound `user` / `system` messages BEFORE they reach the model. Operates in `transformParams` so the redaction is visible to every downstream middleware (cache keys, traces).

```ts
import { redactPII, heuristicPiiAdapter } from '@ziro-agent/middleware';

redactPII({
  adapter: heuristicPiiAdapter(),                  // default; swap for Presidio / AWS Comprehend
  entities: ['EMAIL', 'PHONE_NUMBER', 'SSN', 'CREDIT_CARD'],  // default
  redactUserMessages: true,                        // default; tool messages are always skipped
  onRedacted: ({ replacements }) =>
    log.info({ count: Object.keys(replacements).length }),
});
```

- The built-in **heuristic adapter** is regex-based, zero-dep, and **conservative by design** — false negatives are possible. NEVER rely on it for GDPR / HIPAA compliance.
- Plug in a model-based adapter via the 3-method `PiiAdapter` interface for production:

  ```ts
  import type { PiiAdapter } from '@ziro-agent/middleware';

  const presidio: PiiAdapter = {
    async redact({ text, entities }) {
      const res = await fetch(`${PRESIDIO_URL}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ text, entities }),
      }).then((r) => r.json());
      return { redacted: res.text, replacements: res.replacements };
    },
  };

  redactPII({ adapter: presidio });
  ```

- Tool messages are **skipped** because they often carry already-structured data; redact at the tool boundary instead.
- The middleware never resurrects the original PII. If you need restoration, capture the `onRedacted` map and rewrite the response in application code — the SDK refuses to ship that primitive until the threat model is settled (see [RFC 0005 unresolved questions](../../rfcs/0005-language-model-middleware.md#unresolved-questions)).

### `blockPromptInjection(options)`

Pre-flight guard against jailbreak attempts and indirect injection via tool results. Throws `PromptInjectionError` on the first offending message — `wrapGenerate` / `wrapStream` is never reached.

```ts
import { blockPromptInjection, PromptInjectionError } from '@ziro-agent/middleware';

blockPromptInjection({
  heuristic: true,                            // default; built-in regex catches obvious cases
  scanRoles: ['user', 'tool'],                // default; tool results are an indirect-injection vector
  minScore: 0.5,                              // adapter score threshold (heuristic always blocks on match)
  onBlocked: ({ verdict, messageIndex }) =>
    metrics.inc('prompt_injection.blocked', { rule: verdict.reason }),
});
```

- The built-in heuristic catches `ignore previous instructions`, `you are now …`, `reveal the system prompt`, `DAN mode`, etc. **High precision, low recall** — pair with an adapter for production.
- Adapters (Lakera, Rebuff, custom) plug in via the 3-method `PromptInjectionAdapter` interface:

  ```ts
  import type { PromptInjectionAdapter } from '@ziro-agent/middleware';

  const lakera: PromptInjectionAdapter = {
    async check({ text }) {
      const res = await fetch('https://api.lakera.ai/v1/prompt_injection', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.LAKERA_KEY}` },
        body: JSON.stringify({ input: text }),
      }).then((r) => r.json());
      return { injected: res.flagged, score: res.score, reason: res.category };
    },
  };

  blockPromptInjection({ adapter: lakera, heuristic: true, minScore: 0.5 });
  ```

- Place this **first** in the middleware stack — you don't want a cache hit (or any side-effect) downstream of an injection attempt.

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

- **Stable**: `wrapModel`, `retry`, `cache`, `redactPII`, `blockPromptInjection`.
- **Coming next** (tracked in [RFC 0005 unresolved questions](../../rfcs/0005-language-model-middleware.md#unresolved-questions)):
  - `structuredOutput(schema)` — Zod-validated post-processing with a single retry on schema failure.
  - Tracing spans (`ziro.middleware.<id>`) and a `printMiddlewareChain(model)` debug helper.
  - Cache-stream support (current `cache()` deliberately bypasses streams; experimental flag landing in `0.2.x`).

Open an issue or RFC if your team needs one of these sooner.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
