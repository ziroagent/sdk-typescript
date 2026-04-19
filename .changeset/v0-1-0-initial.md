---
"@ziro-ai/core": minor
"@ziro-ai/openai": minor
"@ziro-ai/anthropic": minor
"@ziro-ai/tools": minor
"@ziro-ai/agent": minor
"@ziro-ai/memory": minor
"@ziro-ai/workflow": minor
"@ziro-ai/tracing": minor
"@ziro-ai/cli": minor
---

Initial public v0.1.0 release of the Ziro AI SDK.

This is the first public release of the full SDK surface:

- `@ziro-ai/core` — `LanguageModel` interface, `generateText`, `streamText`,
  Web Streams primitives, structured error hierarchy, prompt normalization.
- `@ziro-ai/openai` — OpenAI / OpenAI-compatible chat provider with SSE
  streaming, tool calls, and usage reporting.
- `@ziro-ai/anthropic` — Anthropic Messages API provider with native
  event-stream parsing.
- `@ziro-ai/tools` — Type-safe `defineTool` (Zod v4), JSON Schema export,
  parallel execution, MCP client adapter.
- `@ziro-ai/agent` — ReAct-style agent loop with step events, configurable
  `stopWhen` predicates, error recovery, and `AbortSignal` support.
- `@ziro-ai/memory` — `VectorStore` interface, in-memory adapter, pgvector
  adapter, recursive text chunker, OpenAI-compatible embedder.
- `@ziro-ai/workflow` — Lightweight graph engine with parallel waves,
  conditional routing, and shared typed state.
- `@ziro-ai/tracing` — Optional OpenTelemetry instrumentation aligned with
  the GenAI semantic conventions.
- `@ziro-ai/cli` — `ziro init`, `ziro run <example>`, `ziro playground`.

All packages are dual ESM/CJS, fully typed, tree-shakeable, and published
under Apache-2.0.
