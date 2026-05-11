# @ziro-agent/openapi

## 0.4.0

### Minor Changes

- [#125](https://github.com/ziroagent/sdk-typescript/pull/125) [`8fd017a`](https://github.com/ziroagent/sdk-typescript/commit/8fd017adb526115f711296f748213e6e08712fc6) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **OpenAPI (RFC 0010):** Emit tools for POST/PUT/PATCH/DELETE/HEAD with `application/json` object bodies (nested `body` input), path substitution, optional bearer token, sorted query keys. Resolve same-document **`#/components/schemas/*`** and **`requestBody` `$ref`**; merge path-item **`parameters`** with operation parameters (operation wins on duplicate `in`+`name`).

  **Groq:** New `@ziro-agent/groq` provider wrapping OpenAI-compatible Groq Cloud HTTP API.

  **Eval:** `createRecordingRegressionCase`, `defineRecordingRegressionEval`, and `expectedAssistantTextFromRecording` bridge agent JSONL recordings to regression evals (RFC 0015). **Declarative `*.eval.json`** — `evalSpecFromJsonDataset` (v1: `ziroEvalDataset`, `runKind: "modelText"`, `exactMatch` graders) for `ziroagent eval`.

  **CLI:** Load `*.eval.json` files alongside TypeScript eval modules; directory walk includes `*.eval.json`.

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.12

## 0.3.0

### Minor Changes

- [#120](https://github.com/ziroagent/sdk-typescript/pull/120) [`99d2485`](https://github.com/ziroagent/sdk-typescript/commit/99d2485a9ff7f50b99ca396230a81a22b2523b42) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **OpenAPI (RFC 0010):** Emit tools for POST/PUT/PATCH/DELETE/HEAD with `application/json` object bodies (nested `body` input), path substitution, optional bearer token, sorted query keys. Resolve same-document **`#/components/schemas/*`** and **`requestBody` `$ref`**; merge path-item **`parameters`** with operation parameters (operation wins on duplicate `in`+`name`).

  **Groq:** New `@ziro-agent/groq` provider wrapping OpenAI-compatible Groq Cloud HTTP API.

  **Eval:** `createRecordingRegressionCase`, `defineRecordingRegressionEval`, and `expectedAssistantTextFromRecording` bridge agent JSONL recordings to regression evals (RFC 0015).

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.11

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.10

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.9

## 0.2.10

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.8

## 0.2.9

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.7

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.6

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.5

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.4

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.3

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.2

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/tools@0.6.1

## 0.2.2

### Patch Changes

- Updated dependencies [[`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7), [`683efc4`](https://github.com/ziroagent/sdk-typescript/commit/683efc4051d4713487a71da2be0d2ea4a40f6bb5), [`0f58843`](https://github.com/ziroagent/sdk-typescript/commit/0f588430fa422c2711c2614daa9634e31f7abba3)]:
  - @ziro-agent/tools@0.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/tools@0.5.0

## 0.2.0

### Minor Changes

- [#32](https://github.com/ziroagent/sdk-typescript/pull/32) [`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add v0.4 memory and RAG primitives: hybrid search on `MemoryVectorStore` and `PgVectorStore` (FTS + dense + RRF), `retrieve()` with optional Cohere/Voyage rerankers, `loadDocument()` for local text and PDF (via `pdf-parse`), working and conversation memory plus `createAgent({ memory })`. Standard Schema support in `@ziro-agent/tools`. New `@ziro-agent/mcp-server` and `@ziro-agent/openapi`, CLI `ziroagent mcp serve`, and `@ziro-agent/core/testing` mock/record helpers.

### Patch Changes

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/tools@0.4.2
