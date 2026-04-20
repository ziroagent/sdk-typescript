---
'@ziro-agent/ollama': minor
---

**Initial release — Ollama provider (Sovereign pillar primitive)**

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
