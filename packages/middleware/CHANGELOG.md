# @ziro-agent/middleware

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
