# @ziro-agent/groq

## 0.2.0

### Minor Changes

- [#120](https://github.com/ziroagent/sdk-typescript/pull/120) [`99d2485`](https://github.com/ziroagent/sdk-typescript/commit/99d2485a9ff7f50b99ca396230a81a22b2523b42) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **OpenAPI (RFC 0010):** Emit tools for POST/PUT/PATCH/DELETE/HEAD with `application/json` object bodies (nested `body` input), path substitution, optional bearer token, sorted query keys. Resolve same-document **`#/components/schemas/*`** and **`requestBody` `$ref`**; merge path-item **`parameters`** with operation parameters (operation wins on duplicate `in`+`name`).

  **Groq:** New `@ziro-agent/groq` provider wrapping OpenAI-compatible Groq Cloud HTTP API.

  **Eval:** `createRecordingRegressionCase`, `defineRecordingRegressionEval`, and `expectedAssistantTextFromRecording` bridge agent JSONL recordings to regression evals (RFC 0015).

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/openai@0.2.17
