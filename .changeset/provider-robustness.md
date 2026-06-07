---
'@ziro-agent/core': minor
'@ziro-agent/openai': minor
'@ziro-agent/anthropic': minor
'@ziro-agent/google': minor
'@ziro-agent/ollama': minor
'@ziro-agent/middleware': minor
---

Provider production-readiness hardening:

- **Default request timeout** on every provider (configurable via `timeoutMs`; 60s default, 120s for Ollama). A hung socket previously hung forever.
- **Network errors are wrapped** as a retryable `APICallError`, so `retry()` actually retries dropped connections / DNS failures (a raw `TypeError` previously bypassed the retry predicate).
- **`Retry-After` is honoured:** providers capture it into `APICallError.retryAfterMs` and `retry()` uses it instead of blind exponential backoff on 429/503.
- **Anthropic mid-stream `error` events** (e.g. `overloaded_error`) now surface as a real error part instead of being silently dropped as a clean, empty finish.
- **Google API keys no longer leak** into `APICallError.url` — the `?key=...` query param is redacted.
- New shared `providerFetch` / `redactQueryKey` / `parseRetryAfterMs` utilities in `@ziro-agent/core`.
