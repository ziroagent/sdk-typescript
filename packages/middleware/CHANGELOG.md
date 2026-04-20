# @ziro-agent/middleware

## 0.3.0

### Minor Changes

- [`fbda929`](https://github.com/ziroagent/sdk-typescript/commit/fbda929606c73b154e4d96384b6f2105b40537b9) - Two new built-in middlewares land for [RFC 0005](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0005-language-model-middleware.md):

  - **`redactPII({ adapter, entities, redactUserMessages, onRedacted })`** — strip
    PII tokens from outbound `user` / `system` messages BEFORE they reach the
    model. Operates in `transformParams` so the redaction is visible to every
    downstream middleware (cache keys, traces). Ships a regex-based
    `heuristicPiiAdapter()` for `EMAIL`, `PHONE_NUMBER`, `SSN`, `CREDIT_CARD`,
    `IP_ADDRESS`, `IBAN` — conservative by design (false negatives possible;
    not a compliance control). External adapters (Microsoft Presidio, AWS
    Comprehend, custom models) plug in via the 3-method `PiiAdapter` interface.
    Tool messages are skipped on purpose — redact at the tool boundary instead.

  - **`blockPromptInjection({ adapter, heuristic, scanRoles, minScore, onBlocked })`**
    — pre-flight guard. Throws `PromptInjectionError` on the first offending
    message; `wrapGenerate` / `wrapStream` is never reached. Built-in
    heuristic catches `ignore previous instructions`, `you are now …`,
    `reveal the system prompt`, `DAN mode`, etc. Scans `user` AND `tool`
    messages by default to defend against indirect injection via tool
    results (a documented attack vector). Pair with Lakera / Rebuff / a
    custom classifier through the 3-method `PromptInjectionAdapter` interface
    for production-grade coverage.

  Both compose with the existing `retry()` and `cache()` via the core
  `wrapModel(model, middleware[])` helper. No core changes — the
  `LanguageModelMiddleware` interface and `wrapModel` already shipped in
  `@ziro-agent/core`.

### Patch Changes

- Updated dependencies [[`16d80c8`](https://github.com/ziroagent/sdk-typescript/commit/16d80c8a829b7ccfec977058ab0f08a828cca468), [`bba9d98`](https://github.com/ziroagent/sdk-typescript/commit/bba9d9813d8375b7bfad3bef37d93531d14c4b2d)]:
  - @ziro-agent/core@0.5.0

## 0.2.0

### Minor Changes

- **New: `@ziro-agent/middleware` package + `LanguageModelMiddleware` interface in core (RFC 0005).**

  Adds a composable middleware layer for `LanguageModel`, allowing cross-cutting concerns like retry, caching, and PII redaction to be written once and applied to any provider via `wrapModel(model, middleware)`.

  Initial built-ins shipped:

  - `retry({ maxAttempts, baseDelayMs, maxDelayMs, isRetryable, onRetry })` — full-jittered exponential backoff over `APICallError.isRetryable`. Cooperates with `params.abortSignal`. Streams retry only on open failure.
  - `cache({ store, ttlMs, keyOf, onEvent })` — short-circuits `wrapGenerate` on identical params. In-memory `MemoryCacheStore` ships by default; `CacheStore` interface lets you plug in Redis / SQLite / KV. Streams pass through (intentionally not cached).

  Core additions:

  - `LanguageModelMiddleware` interface: optional `transformParams`, `wrapGenerate`, `wrapStream` hooks.
  - `wrapModel(model, mw | mw[])` helper: onion composition (first middleware = outermost). Re-wrapping is supported and composes naturally.
  - Both exported from `@ziro-agent/core`.

  No breaking changes — existing `LanguageModel` consumers are unaffected.

### Patch Changes

- Updated dependencies
- Updated dependencies [082e91a]
  - @ziro-agent/core@0.4.0
