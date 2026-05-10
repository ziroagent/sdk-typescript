---
'@ziro-agent/openapi': minor
'@ziro-agent/groq': minor
'@ziro-agent/eval': minor
---

**OpenAPI (RFC 0010):** Emit tools for POST/PUT/PATCH/DELETE/HEAD with `application/json` object bodies (nested `body` input), path substitution, optional bearer token, sorted query keys. Resolve same-document **`#/components/schemas/*`** and **`requestBody` `$ref`**; merge path-item **`parameters`** with operation parameters (operation wins on duplicate `in`+`name`).

**Groq:** New `@ziro-agent/groq` provider wrapping OpenAI-compatible Groq Cloud HTTP API.

**Eval:** `createRecordingRegressionCase`, `defineRecordingRegressionEval`, and `expectedAssistantTextFromRecording` bridge agent JSONL recordings to regression evals (RFC 0015).
