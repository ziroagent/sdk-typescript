---
'@ziro-agent/middleware': minor
---

Two new built-in middlewares land for [RFC 0005](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0005-language-model-middleware.md):

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
