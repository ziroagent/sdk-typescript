# @ziro-ai/tracing

## 0.0.0-20260419121701

### Minor Changes

- Initial public release of the Ziro AI SDK (`v0.1.0`).

  Ships nine TypeScript packages forming a complete, provider-agnostic stack
  for building LLM-powered apps and agents:

  - `@ziro-ai/core`: `LanguageModel` interface, `generateText`, `streamText`,
    Web Streams primitives, error hierarchy, normalized message / content types.
  - `@ziro-ai/openai`, `@ziro-ai/anthropic`: lazy-init provider adapters with
    full SSE streaming support.
  - `@ziro-ai/tools`: Zod-based `defineTool`, JSON-schema converter (Zod v4
    native), parallel `executeToolCalls`, optional MCP client adapter.
  - `@ziro-ai/agent`: type-safe ReAct loop with step events, `stopWhen`
    predicates, `maxSteps`, and `AbortSignal` support.
  - `@ziro-ai/memory`: `VectorStore` interface with in-memory and Postgres +
    pgvector adapters, recursive chunker, OpenAI embedder factory.
  - `@ziro-ai/workflow`: lightweight graph engine with parallel waves,
    conditional routing, and shared mutable state.
  - `@ziro-ai/tracing`: optional OpenTelemetry instrumentation following the
    GenAI semantic conventions.
  - `@ziro-ai/cli`: `ziro init`, `ziro run <example>`, `ziro playground`.

### Patch Changes

- Updated dependencies
  - @ziro-ai/core@0.0.0-20260419121701
