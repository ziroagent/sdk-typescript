# @ziro-agent/cli

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.17
  - @ziro-agent/tools@0.6.6
  - @ziro-agent/mcp-server@0.2.8

## 0.5.1

### Patch Changes

- Updated dependencies [[`1d0f6cd`](https://github.com/ziroagent/sdk-typescript/commit/1d0f6cd685f8c09728414b0ad645e19c5676ce59)]:
  - @ziro-agent/compliance@0.5.0
  - @ziro-agent/eval@0.2.16

## 0.5.0

### Minor Changes

- [#76](https://github.com/ziroagent/sdk-typescript/pull/76) [`2848361`](https://github.com/ziroagent/sdk-typescript/commit/284836105d590a181e1c265082945d3c493fb5ef) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **@ziro-agent/cli** — `ziroagent audit verify <file.jsonl>`; compliance `report` supports `--versions-file` and `--versions-json`.

  **@ziro-agent/compliance** — `ComplianceReportInput.packageVersions` and SOC2 / JSON report sections.

  **@ziro-agent/audit** — Test coverage for tampered hash detection in `verifyJsonlAuditLogChain`.

### Patch Changes

- Updated dependencies [[`2848361`](https://github.com/ziroagent/sdk-typescript/commit/284836105d590a181e1c265082945d3c493fb5ef)]:
  - @ziro-agent/compliance@0.4.0
  - @ziro-agent/audit@0.3.1
  - @ziro-agent/eval@0.2.15

## 0.4.1

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.14

## 0.4.0

### Minor Changes

- [#72](https://github.com/ziroagent/sdk-typescript/pull/72) [`8e3c3d7`](https://github.com/ziroagent/sdk-typescript/commit/8e3c3d71d3f326ac311af34da8140c9d3e2e738a) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **@ziro-agent/agent** — Node entry `@ziro-agent/agent/node` with `replayAgentRunFromRecordingFile` (JSONL path → replay run).

  **@ziro-agent/compliance** — SOC2 starter `SOC2_CONTROL_MAP` and `renderSoc2MarkdownReport`.

  **@ziro-agent/cli** — `compliance report --framework soc2` emits Markdown; default remains JSON.

  **@ziro-agent/tracing** — `ATTR.MemoryProcessorName` for memory processor spans.

### Patch Changes

- Updated dependencies [[`8e3c3d7`](https://github.com/ziroagent/sdk-typescript/commit/8e3c3d71d3f326ac311af34da8140c9d3e2e738a)]:
  - @ziro-agent/compliance@0.3.0
  - @ziro-agent/eval@0.2.13

## 0.3.0

### Minor Changes

- **@ziro-agent/audit** — Initial release: append-only JSONL audit log with SHA-256 hash chain (`JsonlAuditLog`, `canonicalJsonStringify`).

  **@ziro-agent/compliance** — Initial release: ordered `deleteUserDataInOrder`, `buildComplianceReportJson`, EU AI Act draft template helper.

  **@ziro-agent/memory** — Conversation snapshot store (`DirConversationSnapshotStore`, `PersistingConversationMemory`), deterministic `createDroppedMessagesSnippetCompressor` for summarising memory.

  **@ziro-agent/agent** — OpenTelemetry spans around the memory pipeline in `buildLlmMessages`; `replayAgentFromRecording` / `replayAgentFromRecordingJsonl` helpers for recorded runs.

  **@ziro-agent/middleware** — Optional adaptive fallback ordering (`adaptive` on `modelFallback`, `resetModelFallbackAdaptiveState`).

  **@ziro-agent/tracing** — New span attribute keys for memory phases and thread correlation (`ATTR.ThreadId`, `MemoryPhase`, `MemoryProcessorIndex`, `MemoryProcessorCount`).

  **@ziro-agent/cli** — `ziroagent compliance report` and `ziroagent compliance eu-ai-act-template` commands.

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/compliance@0.2.0
  - @ziro-agent/eval@0.2.12

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.11
  - @ziro-agent/tools@0.6.5
  - @ziro-agent/mcp-server@0.2.7

## 0.2.10

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.10
  - @ziro-agent/tools@0.6.4
  - @ziro-agent/mcp-server@0.2.6

## 0.2.9

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.9
  - @ziro-agent/tools@0.6.3
  - @ziro-agent/mcp-server@0.2.5

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.8
  - @ziro-agent/tools@0.6.2
  - @ziro-agent/mcp-server@0.2.4

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.7
  - @ziro-agent/tools@0.6.1
  - @ziro-agent/mcp-server@0.2.3

## 0.2.6

### Patch Changes

- Updated dependencies [[`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7), [`683efc4`](https://github.com/ziroagent/sdk-typescript/commit/683efc4051d4713487a71da2be0d2ea4a40f6bb5), [`0f58843`](https://github.com/ziroagent/sdk-typescript/commit/0f588430fa422c2711c2614daa9634e31f7abba3)]:
  - @ziro-agent/tools@0.6.0
  - @ziro-agent/eval@0.2.6
  - @ziro-agent/mcp-server@0.2.2

## 0.2.5

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/tools@0.5.0
  - @ziro-agent/eval@0.2.5
  - @ziro-agent/mcp-server@0.2.1

## 0.2.4

### Patch Changes

- [#32](https://github.com/ziroagent/sdk-typescript/pull/32) [`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add v0.4 memory and RAG primitives: hybrid search on `MemoryVectorStore` and `PgVectorStore` (FTS + dense + RRF), `retrieve()` with optional Cohere/Voyage rerankers, `loadDocument()` for local text and PDF (via `pdf-parse`), working and conversation memory plus `createAgent({ memory })`. Standard Schema support in `@ziro-agent/tools`. New `@ziro-agent/mcp-server` and `@ziro-agent/openapi`, CLI `ziroagent mcp serve`, and `@ziro-agent/core/testing` mock/record helpers.

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/tools@0.4.2
  - @ziro-agent/mcp-server@0.2.0
  - @ziro-agent/eval@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @ziro-agent/eval@0.2.3

## 0.2.2

### Patch Changes

- @ziro-agent/eval@0.2.2

## 0.2.1

### Patch Changes

- @ziro-agent/eval@0.2.1

## 0.2.0

### Minor Changes

- 3ae653a: **RFC 0003 — Evals as first-class** lands in v0.1.8. New package
  `@ziro-agent/eval` ships `defineEval` + `runEval` (worker-pool concurrency,
  per-case `withBudget` scope, JSON-serialisable `EvalRun`) and seven built-in
  graders: `exactMatch`, `contains`, `regex`, `costBudget`, `latency`,
  `noToolErrors`, and `llmJudge` (LanguageModel-as-judge, fences stripped, JSON
  extracted, scores clamped, optional own budget). Four `EvalGate` shapes —
  `meanScore` (default 0.95), `passRate`, `every` per-grader, and `custom`. Text

  - JSON reporters; `evaluateGate` exported for shared semantics.

  `@ziro-agent/cli` gains `ziroagent eval <path-or-glob>...` with `--gate`
  (number or JSON), `--concurrency`, `--reporter text|json`, `--out <file>`,
  `--fail-fast`, `--grep <pattern>`. Exit codes: `0` all gates pass, `1` at
  least one fails, `2` loader / configuration error. Each spec runs sequentially
  while its cases run in parallel; `AgentSuspendedError` (RFC 0002) is captured
  into `case.agentSnapshot` so suspended runs are still gradable on cost /
  latency without crashing the runner.

  Pure addition — no breaking changes. See `rfcs/0003-evals-as-first-class.md`
  and `examples/agent-with-evals/` for the full picture.

### Patch Changes

- Updated dependencies [3ae653a]
  - @ziro-agent/eval@0.2.0

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
