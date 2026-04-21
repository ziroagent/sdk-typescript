# @ziro-agent/ollama

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
