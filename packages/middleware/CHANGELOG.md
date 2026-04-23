# @ziro-agent/middleware

## 0.5.0

### Minor Changes

- **@ziro-agent/audit** — Initial release: append-only JSONL audit log with SHA-256 hash chain (`JsonlAuditLog`, `canonicalJsonStringify`).

  **@ziro-agent/compliance** — Initial release: ordered `deleteUserDataInOrder`, `buildComplianceReportJson`, EU AI Act draft template helper.

  **@ziro-agent/memory** — Conversation snapshot store (`DirConversationSnapshotStore`, `PersistingConversationMemory`), deterministic `createDroppedMessagesSnippetCompressor` for summarising memory.

  **@ziro-agent/agent** — OpenTelemetry spans around the memory pipeline in `buildLlmMessages`; `replayAgentFromRecording` / `replayAgentFromRecordingJsonl` helpers for recorded runs.

  **@ziro-agent/middleware** — Optional adaptive fallback ordering (`adaptive` on `modelFallback`, `resetModelFallbackAdaptiveState`).

  **@ziro-agent/tracing** — New span attribute keys for memory phases and thread correlation (`ATTR.ThreadId`, `MemoryPhase`, `MemoryProcessorIndex`, `MemoryProcessorCount`).

  **@ziro-agent/cli** — `ziroagent compliance report` and `ziroagent compliance eu-ai-act-template` commands.

## 0.4.0

### Minor Changes

- [#67](https://github.com/ziroagent/sdk-typescript/pull/67) [`ad1bd03`](https://github.com/ziroagent/sdk-typescript/commit/ad1bd03ba2dfde2eb7f8be4b2a0000845d932f48) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add `modelFallback` middleware with optional circuit breaker, OpenTelemetry hook for fallback events, agent JSONL recording/replay (`runWithAgentRecording`, replay model/tools from trace), memory document parser registry plus optional raster image OCR via `tesseract.js`, and RFC 0012/0015 documentation updates.

### Patch Changes

- Updated dependencies [[`10b88b0`](https://github.com/ziroagent/sdk-typescript/commit/10b88b010b8c722954b1cead51c47f27adcbae24), [`59ca15d`](https://github.com/ziroagent/sdk-typescript/commit/59ca15d600266292aaacf59eb03bd5c00feb8c90), [`9924a20`](https://github.com/ziroagent/sdk-typescript/commit/9924a2077353e385ded93e3a28ac5ddad32a9da8)]:
  - @ziro-agent/core@0.8.1

## 0.3.7

### Patch Changes

- Updated dependencies [[`1354315`](https://github.com/ziroagent/sdk-typescript/commit/1354315b2d2de6f13744a962039541301a1ffef6)]:
  - @ziro-agent/core@0.8.0

## 0.3.6

### Patch Changes

- Updated dependencies [[`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4), [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4), [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4)]:
  - @ziro-agent/core@0.7.3

## 0.3.5

### Patch Changes

- Updated dependencies [[`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e)]:
  - @ziro-agent/core@0.7.2

## 0.3.4

### Patch Changes

- Updated dependencies [[`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14)]:
  - @ziro-agent/core@0.7.1

## 0.3.3

### Patch Changes

- Updated dependencies [[`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7), [`683efc4`](https://github.com/ziroagent/sdk-typescript/commit/683efc4051d4713487a71da2be0d2ea4a40f6bb5), [`e726cda`](https://github.com/ziroagent/sdk-typescript/commit/e726cdaa6684b02409a64d63bf59ca4a6e63c127)]:
  - @ziro-agent/core@0.7.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/core@0.6.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/core@0.5.1

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
