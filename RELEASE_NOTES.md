# ZiroAgent SDK — Release Notes

Versioning is per-package (changesets-driven), but every release publishes
all nine packages in lock-step at the same patch level so users can pin a
single version across the workspace.

---

## v0.1.3 — 2026-04-19

**Theme**: Housekeeping + CI publish-auth fix validated end-to-end.

This release ships no runtime changes — it exists to (1) consume the
GitHub Actions major bumps that resolve the "Node.js 20 actions are
deprecated" annotation, and (2) exercise the CI release path after the
in-CI publish auth fix landed in `62bc4d7` (which v0.1.2 had to be
published locally to bypass).

### Infrastructure

- **CI publish auth fixed (`62bc4d7`)** — `actions/setup-node`'s
  `registry-url` was setting `NPM_CONFIG_USERCONFIG` to a placeholder-
  containing `.npmrc` that shadowed the fully-resolved `~/.npmrc`
  written by `changesets/action`. Removing `registry-url` makes
  `changesets/action` the single owner of the auth file, matching the
  path that already works for local `changeset publish`.
- **GitHub Actions on Node.js 24-ready majors** — bumped
  `actions/checkout`, `actions/setup-node`, and `pnpm/action-setup`
  to `v6` across `ci.yml` and `release.yml` (PRs #1, #2, #3).
- **`NPM_CONFIG_PROVENANCE=false` defensive guard** kept in
  `release.yml` until a granular automation token with sigstore
  attestation permission is provisioned.

### Documentation

- This file (`RELEASE_NOTES.md`) restructured as multi-version notes
  with v0.1.1 and v0.1.2 entries added in reverse-chronological order.

### Verified

- All nine packages republish to npm via the CI workflow (this is the
  validation run that v0.1.2 could not complete from CI).

---

## v0.1.2 — 2026-04-19

**Theme**: Dual ESM/CJS type resolution; `attw` and `publint` clean.

### Packaging

- **Separate `import.types` and `require.types` exports** — the
  `exports['.']` map (and the `./mcp` and `./pgvector` subpath exports
  in `@ziro-agent/tools` and `@ziro-agent/memory`) now declares
  distinct `import` / `require` conditions, each with its own `types`
  entry, so ESM consumers receive `.d.ts` and CJS consumers receive
  `.d.cts`. Eliminates the `FalseESM` warnings reported by
  `@arethetypeswrong/cli`.
- **`tsup` emits both `.d.ts` and `.d.cts`** for every entrypoint via
  `dts.format: ["esm", "cjs"]`.
- **`attw --profile=node16`** pinned in every package so legacy
  `node10` resolution warnings stay informational only — subpath
  exports require `node16+` resolution by definition.

### Quality gates

- `publint` clean for all nine published packages.
- `attw` clean (`node16` profile) for all nine published packages.

### Notes

- No runtime behaviour change. This is purely a packaging /
  type-resolution patch.
- v0.1.2 was published from a maintainer's local machine after the CI
  publish step hit a 404 caused by an `actions/setup-node` /
  `changesets/action` `.npmrc` interaction. The fix landed in v0.1.3
  (see above).

---

## v0.1.1 — 2026-04-19

**Theme**: Hotfix — `workspace:*` protocol leaking into published
package manifests.

### Bug fix

- v0.1.0 was published with `workspace:*` left as the literal version
  range in `dependencies` and `peerDependencies` of inter-package
  references (e.g., `@ziro-agent/agent` listed
  `"@ziro-agent/core": "workspace:*"`), which is not a valid range
  for npm consumers. v0.1.1 republishes every package with those
  ranges resolved to the concrete `0.1.1` pin.

### Notes

- No corresponding changeset was authored for v0.1.1; the version was
  bumped manually as part of the hotfix flow.
- No source changes — the artifact-only republish was sufficient.

---

## v0.1.0 — 2026-04-19

**Theme**: First public release. Apache-2.0. ESM + CJS. TypeScript
end-to-end.

The ZiroAgent SDK ships nine TypeScript packages forming a complete,
provider-agnostic stack for building LLM-powered apps and agents.

### Packages

| Package                  | Purpose                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `@ziro-agent/core`       | `LanguageModel` interface, `generateText`, `streamText`, Web Streams, error hierarchy. |
| `@ziro-agent/openai`     | OpenAI / OpenAI-compatible provider with full SSE streaming.                           |
| `@ziro-agent/anthropic`  | Anthropic Messages provider with native event-stream parsing.                          |
| `@ziro-agent/tools`      | Type-safe `defineTool` (Zod), JSON schema, parallel execution, MCP adapter.            |
| `@ziro-agent/agent`      | ReAct loop with step events, `stopWhen` predicates, `AbortSignal`.                     |
| `@ziro-agent/memory`     | `VectorStore` interface, in-memory + pgvector adapters, chunker, embedder.             |
| `@ziro-agent/workflow`   | Lightweight graph engine — parallel waves, conditional routing, shared state.          |
| `@ziro-agent/tracing`    | Optional OpenTelemetry instrumentation following the GenAI semantic conventions.       |
| `@ziro-agent/cli`        | `ziroagent init`, `ziroagent run <example>`, `ziroagent playground`.                   |

### Apps shipping in the monorepo (not published to npm)

- `apps/playground` — Next.js 16 chat UI with live trace viewer and
  session list.
- `apps/docs` — Fumadocs site with getting-started, guides, and an
  auto-generated TypeDoc API reference.

### Examples

- `examples/basic-chat` — minimal `generateText` + `streamText`.
- `examples/agent-with-tools` — agent loop with `getWeather` and
  `calculate` tools.
- `examples/rag-pgvector` — end-to-end RAG against Postgres + `pgvector`.
- `examples/multi-agent-workflow` — planner → writer → critic → editor
  pipeline.

### Quality bar shipped in v0.1.0

- 100% TypeScript, dual ESM/CJS, tree-shakeable (`sideEffects: false`).
- Strict tsconfig with `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`.
- Vitest coverage across every package: 92 tests passing locally.
- `publint` and `@arethetypeswrong/cli` configured for every
  publishable package.
- Biome for linting and formatting; Conventional Commits + Changesets
  for releases.
- GitHub Actions matrix (Node 20 / 22 × Ubuntu / macOS / Windows) plus a
  Changesets-driven release workflow.

---

## How to publish (maintainers)

1. Author a changeset (`pnpm changeset`), commit, push to `main`.
2. The Release workflow opens a "Version Packages" PR.
3. Merge that PR — the workflow then runs `pnpm release`, which builds
   and `changeset publish`es every public package to npm.
4. Tags `@ziro-agent/<pkg>@<version>` are pushed to the repo.
5. Deploy `apps/docs` to your static host of choice (Vercel /
   Cloudflare / GitHub Pages) — the docs site is a regular Next.js app.

> **Note (as of v0.1.3):** npm provenance is disabled in CI
> (`NPM_CONFIG_PROVENANCE=false`) until the project's NPM_TOKEN is
> upgraded to a granular automation token with sigstore attestation
> permission. Re-enable by removing the env var and rotating the token.
