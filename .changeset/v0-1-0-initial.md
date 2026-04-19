---
"@ziroagent/core": minor
"@ziroagent/openai": minor
"@ziroagent/anthropic": minor
"@ziroagent/tools": minor
"@ziroagent/agent": minor
"@ziroagent/memory": minor
"@ziroagent/workflow": minor
"@ziroagent/tracing": minor
"@ziroagent/cli": minor
---

Initial public v0.1.0 release of the ZiroAgent SDK.

This is the first public release of the full SDK surface:

- `@ziroagent/core` — `LanguageModel` interface, `generateText`, `streamText`,
  Web Streams primitives, structured error hierarchy, prompt normalization.
- `@ziroagent/openai` — OpenAI / OpenAI-compatible chat provider with SSE
  streaming, tool calls, and usage reporting.
- `@ziroagent/anthropic` — Anthropic Messages API provider with native
  event-stream parsing.
- `@ziroagent/tools` — Type-safe `defineTool` (Zod v4), JSON Schema export,
  parallel execution, MCP client adapter.
- `@ziroagent/agent` — ReAct-style agent loop with step events, configurable
  `stopWhen` predicates, error recovery, and `AbortSignal` support.
- `@ziroagent/memory` — `VectorStore` interface, in-memory adapter, pgvector
  adapter, recursive text chunker, OpenAI-compatible embedder.
- `@ziroagent/workflow` — Lightweight graph engine with parallel waves,
  conditional routing, and shared typed state.
- `@ziroagent/tracing` — Optional OpenTelemetry instrumentation aligned with
  the GenAI semantic conventions.
- `@ziroagent/cli` — `ziroagent init`, `ziroagent run <example>`, `ziroagent playground`.

All packages are dual ESM/CJS, fully typed, tree-shakeable, and published
under Apache-2.0.
