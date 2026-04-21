# @ziro-agent/ollama

## 0.2.5

### Patch Changes

- [#45](https://github.com/ziroagent/sdk-typescript/pull/45) [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add reserved `VideoPart` to `UserMessage` content union; normalize + token estimate; Ollama preflight rejects `video`; chat providers throw `UnsupportedPartError` until mapping exists (RFC 0014).

- Updated dependencies [[`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14)]:
  - @ziro-agent/core@0.7.1

## 0.2.4

### Patch Changes

- [#42](https://github.com/ziroagent/sdk-typescript/pull/42) [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add reserved `VideoPart` to `UserMessage` content union; normalize + token estimate; Ollama preflight rejects `video`; chat providers throw `UnsupportedPartError` until mapping exists (RFC 0014).

- [#40](https://github.com/ziroagent/sdk-typescript/pull/40) [`e726cda`](https://github.com/ziroagent/sdk-typescript/commit/e726cdaa6684b02409a64d63bf59ca4a6e63c127) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **v0.7 multimodal slice (I2 + I3 — types + provider mapping)**

  - **@ziro-agent/core** — `AudioPart` / `FilePart`; `normalizePrompt`; `estimateTokensFromMessages` heuristics; `resolveMediaInput()` for data URLs / bytes / http(s) & `file:` URLs; `UnsupportedPartError`; `assertProviderMapsUserMultimodalParts()` (Ollama only — stable chat API has no audio/file fields).
  - **@ziro-agent/openai** — `input_audio` (wav/mp3, inline only); `file` (`file-…` id or `file_data` base64).
  - **@ziro-agent/anthropic** — `document` for PDF (base64 or URL) and plain text (base64); audio still unsupported at API level → `UnsupportedPartError`.
  - **@ziro-agent/google** — Gemini `inlineData` / `fileData` for audio and file parts.
  - **@ziro-agent/ollama** — audio/file remain unsupported (`images[]` only) → `UnsupportedPartError`.

  ROADMAP §v0.7: I2/I3 updated for per-provider coverage; H4/H5 unchanged.

- Updated dependencies [[`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7), [`683efc4`](https://github.com/ziroagent/sdk-typescript/commit/683efc4051d4713487a71da2be0d2ea4a40f6bb5), [`e726cda`](https://github.com/ziroagent/sdk-typescript/commit/e726cdaa6684b02409a64d63bf59ca4a6e63c127)]:
  - @ziro-agent/core@0.7.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/core@0.6.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/core@0.5.1

## 0.2.1

### Patch Changes

- Updated dependencies [[`16d80c8`](https://github.com/ziroagent/sdk-typescript/commit/16d80c8a829b7ccfec977058ab0f08a828cca468), [`bba9d98`](https://github.com/ziroagent/sdk-typescript/commit/bba9d9813d8375b7bfad3bef37d93531d14c4b2d)]:
  - @ziro-agent/core@0.5.0

## 0.2.0

### Minor Changes

- cdfad7c: **Initial release — Ollama provider (Sovereign pillar primitive)**

  Brings open-weight, locally-hosted models to ZiroAgent SDK with the
  same `LanguageModel` interface as `@ziro-agent/openai` and
  `@ziro-agent/anthropic`. Closes the credibility gap on the OSS-first
  promise — you can now build an agent end-to-end without ever sending
  bytes to a third-party API (RFC 0004 §v0.1.9 trust-recovery).

  - `createOllama({ baseURL, headers, defaultOptions })` factory; default
    singleton `ollama` connects to `localhost:11434` (or
    `OLLAMA_BASE_URL`).
  - Native Ollama protocol — uses `/api/chat` with NDJSON streaming
    rather than the OpenAI compat shim, preserving tool-call fidelity on
    Llama / Qwen / Mistral.
  - Tool calling, streaming text + tool deltas, image inputs, sampling
    options (`temperature`, `top_p`, `num_predict`, `seed`,
    `stop`, …) all implemented.
  - Budget Guard composes cleanly: reports `pricingAvailable: true,
minUsd: 0, maxUsd: 0` so `maxUsd` constraints simply never trip on
    local runs (instead of being silently disabled).
    `maxTokens` / `maxLlmCalls` / `maxDurationMs` / `maxSteps` keep
    working as documented.
  - 6 unit tests covering generate, tool calls, error paths, custom
    baseURL, NDJSON streaming, and zero-cost pricing — all mocked via
    `msw`, no live daemon required.

  Recommended models: `llama3.1`, `qwen2.5`, `mistral-nemo`, `gemma3`.

### Patch Changes

- Updated dependencies
- Updated dependencies [082e91a]
  - @ziro-agent/core@0.4.0
