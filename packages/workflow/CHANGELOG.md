# @ziro-agent/workflow

## 0.1.14

### Patch Changes

- Updated dependencies [[`1354315`](https://github.com/ziroagent/sdk-typescript/commit/1354315b2d2de6f13744a962039541301a1ffef6)]:
  - @ziro-agent/core@0.8.0

## 0.1.13

### Patch Changes

- Updated dependencies [[`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4), [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4), [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4)]:
  - @ziro-agent/core@0.7.3

## 0.1.12

### Patch Changes

- Updated dependencies [[`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e)]:
  - @ziro-agent/core@0.7.2

## 0.1.11

### Patch Changes

- Updated dependencies [[`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14)]:
  - @ziro-agent/core@0.7.1

## 0.1.10

### Patch Changes

- Updated dependencies [[`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7), [`683efc4`](https://github.com/ziroagent/sdk-typescript/commit/683efc4051d4713487a71da2be0d2ea4a40f6bb5), [`e726cda`](https://github.com/ziroagent/sdk-typescript/commit/e726cdaa6684b02409a64d63bf59ca4a6e63c127)]:
  - @ziro-agent/core@0.7.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/core@0.6.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/core@0.5.1

## 0.1.7

### Patch Changes

- Updated dependencies [[`16d80c8`](https://github.com/ziroagent/sdk-typescript/commit/16d80c8a829b7ccfec977058ab0f08a828cca468), [`bba9d98`](https://github.com/ziroagent/sdk-typescript/commit/bba9d9813d8375b7bfad3bef37d93531d14c4b2d)]:
  - @ziro-agent/core@0.5.0

## 0.1.6

### Patch Changes

- Updated dependencies
- Updated dependencies [082e91a]
  - @ziro-agent/core@0.4.0

## 0.1.5

### Patch Changes

- 364ebb9: **Human-in-the-Loop (RFC 0002, v0.1.7)** — production-safety primitive #2
  paired with Budget Guard.

  Tools can now declare `requiresApproval` (boolean or
  `(input, ctx) => boolean | Promise<boolean>`). When a guarded tool fires,
  `agent.run({ approver })` either resolves the approval inline through the
  caller-supplied callback or suspends the run by serializing the full
  agent state to a JSON-shaped `AgentSnapshot` and throwing
  `AgentSuspendedError`. Persist the snapshot to any KV store; later call
  `agent.resume(snapshot, { decisions })` to continue — message history,
  pending sibling tool calls, and budget usage carry forward.

  Highlights:

  - **`@ziro-agent/core`** — new `Approver` / `ApprovalRequest` /
    `ApprovalDecision` types; `ApprovalObserver` hook (mirrors
    `BudgetObserver`); `withBudget({ presetUsage })` for budget continuity
    across multi-day suspensions.
  - **`@ziro-agent/tools`** — `defineTool({ requiresApproval })`; per-call
    approval gate inside `executeToolCalls`; new `pendingApproval` variant
    on `ToolExecutionResult`.
  - **`@ziro-agent/agent`** — `AgentSnapshot`, `AgentSuspendedError`,
    `isAgentSuspendedError`, `agent.run({ approver, agentId })`,
    `agent.resume(snapshot, opts)`. Internal `iterateLoop` refactor shares
    state machine between fresh runs and resumed runs.
  - **`@ziro-agent/tracing`** — `instrumentApproval()` emits
    `ziro.approval.*` and `ziro.agent.suspended/resumed` spans + events.

  Bug fix (also in `@ziro-agent/core`): `getCurrentBudget()` /
  `getCurrentScope()` now propagate correctly under pure-ESM Node runtimes
  (e.g. `tsx`, `node --import`). The previous lazy `require('node:async_hooks')`
  silently fell back to `null` in ESM, which broke implicit budget-scope
  propagation across `await` boundaries inside the agent loop.

  See `rfcs/0002-human-in-the-loop.md` and `examples/agent-with-approval/`.

- Updated dependencies [364ebb9]
  - @ziro-agent/core@0.3.0

## 0.1.4

### Patch Changes

- 7efb730: Budget Guard layer 1 (RFC 0001).

  `@ziro-agent/core` ships:

  - `BudgetSpec`, `BudgetUsage`, `BudgetContext`, `CostEstimate` types.
  - `BudgetExceededError` (extends `ZiroError`, branded for cross-realm `isZiroError`).
  - `withBudget(spec, fn)` + `getCurrentBudget()` — `AsyncLocalStorage`-backed scope that nested SDK calls inherit and intersect with.
  - `generateText({ budget })` and `streamText({ budget })` enforce pre-flight (`estimateCost` + `checkBeforeCall`) and post-call (`recordUsage` + `checkAfterCall`) so the SDK throws **before** any over-budget request is dispatched.
  - New subpath `@ziro-agent/core/pricing` with hardcoded OpenAI / Anthropic pricing tables, `getPricing(provider, modelId)`, and `costFromUsage(pricing, usage)` helpers.
  - New util `estimateTokensFromMessages(messages)` (chars/4 heuristic) used as the in-core fallback when a provider does not implement `estimateCost`.

  `@ziro-agent/openai` and `@ziro-agent/anthropic` implement the optional `LanguageModel.estimateCost(options)` method, returning conservative `{minUsd, maxUsd, minTokens, maxTokens}` bounds backed by `@ziro-agent/core/pricing`. Third-party providers continue to work unchanged — Budget Guard falls back to the SDK's pricing table + heuristic estimator.

  `@ziro-agent/agent`, `@ziro-agent/tools`, `@ziro-agent/memory`, `@ziro-agent/tracing`, `@ziro-agent/workflow`, `@ziro-agent/cli` are bumped to consume the new core minor; agent-level `agent.run({ budget, toolBudget })` and tool-level `defineTool({ budget })` integrations land in v0.1.5 / v0.1.6 per the RFC's revised rollout table.

- 7efb730: Budget Guard layers 2+3 (RFC 0001) — agent loop, per-tool declared budgets, OpenTelemetry observability.

  `@ziro-agent/agent` adds:

  - `agent.run({ budget, toolBudget })` — wraps the loop in `withBudget(budget, ...)` so every nested `generateText` and `executeToolCalls` participates in the same `AsyncLocalStorage` scope. `toolBudget` is intersected per tool call.
  - `BudgetSpec.maxSteps` is honored at the agent layer (intentionally ignored at the `generateText` layer); when both `CreateAgentOptions.maxSteps` and `BudgetSpec.maxSteps` are set, the tighter wins.
  - `BudgetSpec.onExceed: 'truncate'` returns an `AgentRunResult` with `finishReason: 'budgetExceeded'` and a populated `budgetExceeded` field instead of throwing. Default remains `'throw'` (back-compat).
  - New step event `{ type: 'budget-exceeded', info }` emitted just before `agent-finish` in `truncate` mode; new `AgentBudgetExceededInfo` and `AgentFinishReason` types exported.

  `@ziro-agent/tools` adds:

  - `defineTool({ budget })` — per-invocation budget that is intersected with the surrounding agent budget and any batch-level `toolBudget`.
  - `executeToolCalls({ toolBudget })` — apply a default budget to every tool call in a batch.
  - `ToolExecutionResult.budgetExceeded` — a `BudgetExceededError` thrown inside a tool is captured here (with `isError: true`) instead of crashing the agent loop. The agent then promotes the first such result back into a budget halt with `origin: 'tool'`.
  - Re-exports `getCurrentBudget` from `@ziro-agent/core` so tool authors get one import.

  `@ziro-agent/tracing` adds:

  - `instrumentBudget()` — registers a `BudgetObserver` that opens a `ziro.budget.scope` span per `withBudget` call and attaches `usage.update`, `warning`, and `exceeded` events. Returns `{ unregister, previous }` for clean teardown / chaining.
  - New `ATTR.Budget*` attribute keys (`ziroagent.budget.spec.*`, `ziroagent.budget.used.*`, `ziroagent.budget.exceeded.*`, `ziroagent.budget.warning.*`, `ziroagent.budget.scope.*`).

  `@ziro-agent/core` (additive patch):

  - New internal-stable hook: `setBudgetObserver()` + `BudgetObserver` interface (subscribers see `onScopeStart`, `onScopeEnd`, `onUsageUpdate`, `onWarning`, `onExceeded`). Observer exceptions are swallowed so instrumentation bugs cannot break user code.
  - `intersectSpecs` re-exported from the package root for the tools layer to compose `tool.budget` ∩ `toolBudget`.
  - `process.emitWarning` is preserved as the back-compat warning channel — tracing now fires in addition, not instead.

  `@ziro-agent/openai`, `@ziro-agent/anthropic`, `@ziro-agent/memory`, `@ziro-agent/workflow`, `@ziro-agent/cli` are bumped to consume the new core patch.

- 7efb730: Budget Guard layer 4 (RFC 0001) — streaming mid-call abort, `onExceed` function form, and pricing-drift CI.

  `@ziro-agent/core` adds:

  - **Streaming mid-call abort.** `streamText({ budget })` now wraps the provider stream in a budget-aware reader that runs `checkMidStream` on every `text-delta` and aborts the underlying HTTP request via a chained `AbortController` as soon as the projected total (`inputTokens + accumulated completion estimate`) crosses the spec's `maxTokens` / `maxUsd`. Pre-flight + post-call enforcement remain unchanged. Resolves RFC 0001 §Q4.
  - **`BudgetSpec.onExceed` function form.** Resolvers receive a `BudgetContext` (spec, observed-so-far, scopeId) and return `{ handled: true, replacement }` to substitute a fallback result, or `{ handled: false }` to re-raise. Wired into `generateText`, `streamText`, and `agent.run` at the layer that **owns** the scope (the layer that passed `budget`); inner SDK calls inheriting a scope propagate `BudgetExceededError` so the owner gets to interpret it. Replacement values must match the calling function's result type — type-parameterized `BudgetResolution<T>` is on the v0.2 roadmap.
  - New `checkMidStream(scope, projectedTokens, projectedUsd)` enforcement primitive (re-exported via `budget/index.js` for users writing custom streaming wrappers).
  - New `applyResolution(scope, error)` and `resolveOnExceed(scope, error)` helpers for layers that need to plug into the function-form resolver.
  - Aggregate promises returned by `streamText` (`text()`, `finishReason()`, `usage()`, `toolCalls()`) now reject — rather than hang — when the underlying stream errors. Each promise also pre-attaches a noop `.catch` so an early rejection doesn't surface as an unhandled rejection on Node.
  - `getCurrentScope` re-exported from the package root.

  `@ziro-agent/agent` adds:

  - `agent.run({ budget: { onExceed: fn } })` invokes the resolver when the agent loop's `withBudget` throws and returns the resolver's `replacement` (typed as `AgentRunResult`) directly. Resolver-thrown errors are surfaced with the original `BudgetExceededError` attached as `cause`. `truncate` semantics (v0.1.5) are unchanged.

  `@ziro-agent/tools`, `@ziro-agent/tracing`: no API changes; recompiled against the new core.

  Infra:

  - New `scripts/check-pricing-drift.ts` parses `packages/core/src/pricing/data.ts` and warns when any entry's `validFrom` is older than `STALENESS_DAYS` (default 60). Default is warn-only — drift is a reminder, not a blocker.
  - New `.github/workflows/pricing-drift.yml` runs the script weekly (Mondays 09:00 UTC) and on PRs that touch the pricing table. Scheduled drift opens / refreshes a `pricing-drift` tracking issue; PR runs surface a workflow annotation. `workflow_dispatch` accepts a `staleness_days` override.

  RFC 0001 status updated to **accepted (v0.1.6)** — Q4 resolved, adoption table flipped to "shipped" for the streaming layer and the function-form resolver.

- Updated dependencies [7efb730]
- Updated dependencies [7efb730]
- Updated dependencies [7efb730]
  - @ziro-agent/core@0.2.0

## 0.1.3

### Patch Changes

- 0ed8984: Housekeeping release — no runtime changes.

  This release exists to (1) consume the GitHub Actions major bumps that
  silence the "Node.js 20 actions are deprecated" annotation, and (2)
  exercise the CI release path end-to-end after the publish-auth fix
  landed in `62bc4d7` (which v0.1.2 had to be published locally to bypass).

  - **CI publish auth fix validated.** `actions/setup-node`'s
    `registry-url` was setting `NPM_CONFIG_USERCONFIG` to a placeholder-
    containing `.npmrc` that shadowed the `~/.npmrc` written by
    `changesets/action`. Removing `registry-url` makes
    `changesets/action` the single owner of the auth file. v0.1.3 is the
    first version to actually go through the resulting CI publish path.
  - **GitHub Actions on Node.js 24-ready majors.** Bumped
    `actions/checkout`, `actions/setup-node`, and `pnpm/action-setup`
    to `v6` across `ci.yml` and `release.yml` (PRs #1, #2, #3).
  - **`RELEASE_NOTES.md` restructured** as multi-version notes with
    v0.1.1 / v0.1.2 / v0.1.3 entries added in reverse-chronological
    order.

  No source under `packages/*/src/**` was touched. All published
  JavaScript and `.d.ts` artifacts are byte-identical to v0.1.2 modulo
  the version bump in each `package.json`.

- Updated dependencies [0ed8984]
  - @ziro-agent/core@0.1.3

## 0.1.2

### Patch Changes

- 95ec001: Improve dual ESM/CJS type resolution.

  `exports['.']` (and the `./mcp` / `./pgvector` subpath exports) now declare
  separate `import.types` and `require.types` conditions — `.d.ts` is served to
  ESM consumers and `.d.cts` to CJS consumers. This eliminates the
  `@arethetypeswrong/cli` `FalseESM` warnings that v0.1.1 still produced and
  makes `moduleResolution: "node16" / "nodenext" / "bundler"` consumers see the
  correct type files for their runtime.

  Also:

  - `attw` scripts pinned to `--profile=node16` so legacy `node10` resolution
    stays informational (subpath exports require `node16+` resolution).
  - `publint` and `attw` now pass cleanly for all nine published packages.
  - No runtime behaviour change.

- Updated dependencies [95ec001]
  - @ziro-agent/core@0.1.2
