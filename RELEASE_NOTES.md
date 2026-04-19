# ZiroAgent SDK — v0.1.0 Release Notes

> First public release. Apache-2.0. ESM + CJS. TypeScript end-to-end.

The ZiroAgent SDK ships nine TypeScript packages forming a complete,
provider-agnostic stack for building LLM-powered apps and agents.

## Packages

| Package                  | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `@ziroagent/core`          | `LanguageModel` interface, `generateText`, `streamText`, Web Streams, error hierarchy. |
| `@ziroagent/openai`        | OpenAI / OpenAI-compatible provider with full SSE streaming.                           |
| `@ziroagent/anthropic`     | Anthropic Messages provider with native event-stream parsing.                          |
| `@ziroagent/tools`         | Type-safe `defineTool` (Zod), JSON schema, parallel execution, MCP adapter.            |
| `@ziroagent/agent`         | ReAct loop with step events, `stopWhen` predicates, `AbortSignal`.                     |
| `@ziroagent/memory`        | `VectorStore` interface, in-memory + pgvector adapters, chunker, embedder.             |
| `@ziroagent/workflow`      | Lightweight graph engine — parallel waves, conditional routing, shared state.          |
| `@ziroagent/tracing`       | Optional OpenTelemetry instrumentation following the GenAI semantic conventions.       |
| `@ziroagent/cli`           | `ziroagent init`, `ziroagent run <example>`, `ziroagent playground`.                                  |

## Apps shipping in the monorepo (not published to npm)

- `apps/playground` — Next.js 16 chat UI with live trace viewer and session list.
- `apps/docs` — Fumadocs site with getting-started, guides, and an
  auto-generated TypeDoc API reference.

## Examples

- `examples/basic-chat` — minimal `generateText` + `streamText`.
- `examples/agent-with-tools` — agent loop with `getWeather` and `calculate` tools.
- `examples/rag-pgvector` — end-to-end RAG against Postgres + `pgvector`.
- `examples/multi-agent-workflow` — planner → writer → critic → editor pipeline.

## Quality bar shipped in v0.1.0

- 100% TypeScript, dual ESM/CJS, tree-shakeable (`sideEffects: false`).
- Strict tsconfig with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- Vitest coverage across every package: 92 tests passing locally.
- `publint` and `@arethetypeswrong/cli` configured for every publishable package.
- Biome for linting and formatting; Conventional Commits + Changesets for releases.
- GitHub Actions matrix (Node 20 / 22 × Ubuntu / macOS / Windows) plus a
  Changesets-driven release workflow with npm provenance.

## How to publish (maintainers)

1. Push to `main`. The Release workflow opens a "Version Packages" PR.
2. Merge that PR. The workflow then runs `pnpm release`, which builds, then
   `changeset publish`es every public package to npm with `--provenance`.
3. GitHub Releases are produced automatically per package version.
4. Deploy `apps/docs` to your static host of choice (Vercel / Cloudflare /
   GitHub Pages) — the docs site is a regular Next.js app.

## Announce

Suggested channels for the v0.1.0 launch: GitHub Discussions, the project's
X / Twitter handle, the `r/LocalLLaMA` and `r/MachineLearning` subreddits,
Hacker News (Show HN), and the OpenTelemetry GenAI working group's
mailing list (since we ship native semantic-conventions support).
