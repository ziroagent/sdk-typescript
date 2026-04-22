# @ziro-agent/core

## 0.7.3

### Patch Changes

- [#53](https://github.com/ziroagent/sdk-typescript/pull/53) [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add reserved `VideoPart` to `UserMessage` content union; normalize + token estimate; Ollama preflight rejects `video`; chat providers throw `UnsupportedPartError` until mapping exists (RFC 0014).

- [#53](https://github.com/ziroagent/sdk-typescript/pull/53) [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` on user messages to Gemini `inlineData` / `fileData` (same transport as file/audio). Update `VideoPart` JSDoc and multimodal docs.

- [#53](https://github.com/ziroagent/sdk-typescript/pull/53) [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` to OpenAI chat `file` parts (`file_id` / `file_data`), matching `FilePart` URL constraints. Optional `filename` on `VideoPart` for OpenAI metadata.

## 0.7.2

### Patch Changes

- [#49](https://github.com/ziroagent/sdk-typescript/pull/49) [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add reserved `VideoPart` to `UserMessage` content union; normalize + token estimate; Ollama preflight rejects `video`; chat providers throw `UnsupportedPartError` until mapping exists (RFC 0014).

- [#49](https://github.com/ziroagent/sdk-typescript/pull/49) [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` on user messages to Gemini `inlineData` / `fileData` (same transport as file/audio). Update `VideoPart` JSDoc and multimodal docs.

- [#49](https://github.com/ziroagent/sdk-typescript/pull/49) [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` to OpenAI chat `file` parts (`file_id` / `file_data`), matching `FilePart` URL constraints. Optional `filename` on `VideoPart` for OpenAI metadata.

## 0.7.1

### Patch Changes

- [#45](https://github.com/ziroagent/sdk-typescript/pull/45) [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add reserved `VideoPart` to `UserMessage` content union; normalize + token estimate; Ollama preflight rejects `video`; chat providers throw `UnsupportedPartError` until mapping exists (RFC 0014).

- [#45](https://github.com/ziroagent/sdk-typescript/pull/45) [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` on user messages to Gemini `inlineData` / `fileData` (same transport as file/audio). Update `VideoPart` JSDoc and multimodal docs.

- [#45](https://github.com/ziroagent/sdk-typescript/pull/45) [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` to OpenAI chat `file` parts (`file_id` / `file_data`), matching `FilePart` URL constraints. Optional `filename` on `VideoPart` for OpenAI metadata.

## 0.7.0

### Minor Changes

- [`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252) - **v0.5 — Safety & governance (C1, C2, C4)**

  - **@ziro-agent/core** — `generateObject()` with Zod validation and optional one-shot repair; `ObjectValidationError`; `BudgetSpec.tenantId` and `hard` (nested scopes coerce soft `onExceed` to `'throw'`); `BudgetContext.tenantId`.
  - **@ziro-agent/tools** — `defineTool({ mutates: true })` sets `requiresApproval: true` when `requiresApproval` is omitted; `mutates` stored on the tool.
  - **@ziro-agent/tracing** — Budget scope attributes `ziroagent.budget.tenant_id` and `ziroagent.budget.spec.hard`.
  - **@ziro-agent/agent** — `serializeBudgetSpec` persists `tenantId` and `hard` on snapshots.

  ROADMAP §v0.5 P0 (C1, C2, C4) marked complete.

- [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7) - **v0.6 resilience slice (K3 + L1 + repairToolCall)**

  - **@ziro-agent/core** — `withFallbackChain([primary, ...])` for `generate`/`stream`; optional `shouldFallback`; export from package root.
  - **@ziro-agent/core/testing** — `createReplayLanguageModel` + `ReplayExhaustedError` for deterministic tests.
  - **@ziro-agent/tools** — `executeToolCalls({ repairToolCall, step })` with one repair retry after Zod parse failure; exported `RepairToolCall` / `RepairToolCallContext`.
  - **@ziro-agent/agent** — `repairToolCall` on `createAgent`, `run`, and `resume`; re-export repair types from package root.

  ROADMAP §v0.6: K3, L1 slice, and `repairToolCall` track marked complete; G5 / full JSONL record-replay deferred.

- [#40](https://github.com/ziroagent/sdk-typescript/pull/40) [`683efc4`](https://github.com/ziroagent/sdk-typescript/commit/683efc4051d4713487a71da2be0d2ea4a40f6bb5) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **v0.7 H4/H5 sandbox & browser slice (interfaces + tool factories)**

  - **@ziro-agent/core** — `SandboxAdapter` / `BrowserAdapter` contracts, execute/result types, `createStubSandboxAdapter()`, `createStubBrowserAdapter()` for tests.
  - **@ziro-agent/tools** — `createCodeInterpreterTool({ sandbox })`; `createBrowserGotoTool` / `createBrowserScreenshotTool({ browser })` (both `mutates: true`).

  Reference adapters `@ziro-agent/sandbox-e2b` / `@ziro-agent/browser-playwright` remain future work per RFC 0013.

- [#40](https://github.com/ziroagent/sdk-typescript/pull/40) [`e726cda`](https://github.com/ziroagent/sdk-typescript/commit/e726cdaa6684b02409a64d63bf59ca4a6e63c127) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **v0.7 multimodal slice (I2 + I3 — types + provider mapping)**

  - **@ziro-agent/core** — `AudioPart` / `FilePart`; `normalizePrompt`; `estimateTokensFromMessages` heuristics; `resolveMediaInput()` for data URLs / bytes / http(s) & `file:` URLs; `UnsupportedPartError`; `assertProviderMapsUserMultimodalParts()` (Ollama only — stable chat API has no audio/file fields).
  - **@ziro-agent/openai** — `input_audio` (wav/mp3, inline only); `file` (`file-…` id or `file_data` base64).
  - **@ziro-agent/anthropic** — `document` for PDF (base64 or URL) and plain text (base64); audio still unsupported at API level → `UnsupportedPartError`.
  - **@ziro-agent/google** — Gemini `inlineData` / `fileData` for audio and file parts.
  - **@ziro-agent/ollama** — audio/file remain unsupported (`images[]` only) → `UnsupportedPartError`.

  ROADMAP §v0.7: I2/I3 updated for per-provider coverage; H4/H5 unchanged.

### Patch Changes

- [#42](https://github.com/ziroagent/sdk-typescript/pull/42) [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add reserved `VideoPart` to `UserMessage` content union; normalize + token estimate; Ollama preflight rejects `video`; chat providers throw `UnsupportedPartError` until mapping exists (RFC 0014).

- [#42](https://github.com/ziroagent/sdk-typescript/pull/42) [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` on user messages to Gemini `inlineData` / `fileData` (same transport as file/audio). Update `VideoPart` JSDoc and multimodal docs.

- [#42](https://github.com/ziroagent/sdk-typescript/pull/42) [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Map `VideoPart` to OpenAI chat `file` parts (`file_id` / `file_data`), matching `FilePart` URL constraints. Optional `filename` on `VideoPart` for OpenAI metadata.

## 0.6.0

### Minor Changes

- [#36](https://github.com/ziroagent/sdk-typescript/pull/36) [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **v0.5 — Safety & governance (C1, C2, C4)**

  - **@ziro-agent/core** — `generateObject()` with Zod validation and optional one-shot repair; `ObjectValidationError`; `BudgetSpec.tenantId` and `hard` (nested scopes coerce soft `onExceed` to `'throw'`); `BudgetContext.tenantId`.
  - **@ziro-agent/tools** — `defineTool({ mutates: true })` sets `requiresApproval: true` when `requiresApproval` is omitted; `mutates` stored on the tool.
  - **@ziro-agent/tracing** — Budget scope attributes `ziroagent.budget.tenant_id` and `ziroagent.budget.spec.hard`.
  - **@ziro-agent/agent** — `serializeBudgetSpec` persists `tenantId` and `hard` on snapshots.

  ROADMAP §v0.5 P0 (C1, C2, C4) marked complete.

- [#36](https://github.com/ziroagent/sdk-typescript/pull/36) [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **v0.6 resilience slice (K3 + L1 + repairToolCall)**

  - **@ziro-agent/core** — `withFallbackChain([primary, ...])` for `generate`/`stream`; optional `shouldFallback`; export from package root.
  - **@ziro-agent/core/testing** — `createReplayLanguageModel` + `ReplayExhaustedError` for deterministic tests.
  - **@ziro-agent/tools** — `executeToolCalls({ repairToolCall, step })` with one repair retry after Zod parse failure; exported `RepairToolCall` / `RepairToolCallContext`.
  - **@ziro-agent/agent** — `repairToolCall` on `createAgent`, `run`, and `resume`; re-export repair types from package root.

  ROADMAP §v0.6: K3, L1 slice, and `repairToolCall` track marked complete; G5 / full JSONL record-replay deferred.

## 0.5.1

### Patch Changes

- [#32](https://github.com/ziroagent/sdk-typescript/pull/32) [`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add v0.4 memory and RAG primitives: hybrid search on `MemoryVectorStore` and `PgVectorStore` (FTS + dense + RRF), `retrieve()` with optional Cohere/Voyage rerankers, `loadDocument()` for local text and PDF (via `pdf-parse`), working and conversation memory plus `createAgent({ memory })`. Standard Schema support in `@ziro-agent/tools`. New `@ziro-agent/mcp-server` and `@ziro-agent/openapi`, CLI `ziroagent mcp serve`, and `@ziro-agent/core/testing` mock/record helpers.

## 0.5.0

### Minor Changes

- [`16d80c8`](https://github.com/ziroagent/sdk-typescript/commit/16d80c8a829b7ccfec977058ab0f08a828cca468) - Add built-in approver presets for HITL: `autoApprove`, `autoSuspend`,
  `autoReject(reason?)`, and `createAutoApprover({ allow, deny, default })`.

  Use these in dev / replay / eval environments where a human-in-the-loop
  isn't appropriate, instead of writing inline `() => ({ decision:
'approve' })` callbacks. Keeping the intent explicit (no `approver:
true` boolean shortcut) makes "HITL is disabled here" reviewable in
  `git grep` and pull requests.

  ```ts
  import { autoApprove, createAutoApprover } from "@ziro-agent/core";

  // Disable HITL entirely (dev only).
  await agent.run({ prompt: "...", approver: autoApprove });

  // Allow read-only tools, deny money movement, suspend everything else.
  await agent.run({
    prompt: "...",
    approver: createAutoApprover({
      allow: ["searchDocs", "getWeather"],
      deny: ["transferFunds"],
      default: "suspend",
    }),
  });
  ```

  `createAutoApprover` defaults to `'suspend'` for unclassified tools so
  the operator never silently approves a new tool by forgetting to update
  the list (fail-safe, not fail-open).

- [`bba9d98`](https://github.com/ziroagent/sdk-typescript/commit/bba9d9813d8375b7bfad3bef37d93531d14c4b2d) - Three new v0.2 packages land together to round out the integration surface:

  - `@ziro-agent/checkpoint-redis` — Redis adapter for the `Checkpointer`
    interface (RFC 0006). Structural `RedisLike` client typing so consumers
    can plug in `ioredis`, node-redis v4+, or any custom transport.
    Per-thread sorted-set index + JSON snapshot keys with optional TTL.
  - `@ziro-agent/google` — Google Gemini provider hitting the Generative
    Language API (and Vertex AI when bring-your-own `Authorization` header
    is set). Streaming, tool calling (with synthesized stable ids since
    Gemini doesn't return them), and `estimateCost` integration.
  - `@ziro-agent/inngest` — Inngest durable execution adapter. Wraps
    agent runs in `step.run` for crash-safe memoization and persists
    HITL snapshots into the configured `Checkpointer` so resume works
    across deploys. Ships a `createInngestAgent({ inngest, agent })`
    factory plus lower-level `runAsStep` / `resumeAsStep` helpers.

  `@ziro-agent/core` widens `ModelPricing.provider` to include `'google'`
  and adds Gemini 2.0/2.5-series rate cards (2.5-series marked
  `unverified: true` per RFC 0004's trust-recovery convention).

## 0.4.0

### Minor Changes

- **New: `@ziro-agent/middleware` package + `LanguageModelMiddleware` interface in core (RFC 0005).**

  Adds a composable middleware layer for `LanguageModel`, allowing cross-cutting concerns like retry, caching, and PII redaction to be written once and applied to any provider via `wrapModel(model, middleware)`.

  Initial built-ins shipped:

  - `retry({ maxAttempts, baseDelayMs, maxDelayMs, isRetryable, onRetry })` — full-jittered exponential backoff over `APICallError.isRetryable`. Cooperates with `params.abortSignal`. Streams retry only on open failure.
  - `cache({ store, ttlMs, keyOf, onEvent })` — short-circuits `wrapGenerate` on identical params. In-memory `MemoryCacheStore` ships by default; `CacheStore` interface lets you plug in Redis / SQLite / KV. Streams pass through (intentionally not cached).

  Core additions:

  - `LanguageModelMiddleware` interface: optional `transformParams`, `wrapGenerate`, `wrapStream` hooks.
  - `wrapModel(model, mw | mw[])` helper: onion composition (first middleware = outermost). Re-wrapping is supported and composes naturally.
  - Both exported from `@ziro-agent/core`.

  No breaking changes — existing `LanguageModel` consumers are unaffected.

- 082e91a: **Pricing data: `unverified` flag for speculative model IDs (RFC 0004 §v0.1.9 trust-recovery)**

  `ModelPricing` gains an optional `unverified?: boolean` field. Rows that
  cannot be cross-referenced against a live provider pricing page (today:
  `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `claude-opus-4-7`,
  `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-opus-4-6`,
  `claude-sonnet-4-5`) are now marked `unverified: true`.

  `getPricing(provider, modelId)` filters unverified rows out by default.
  Pre-flight USD enforcement falls back to the `chars / 4` heuristic
  (same path as for unknown models) instead of trusting a speculative price
  tag. Pass `getPricing(provider, modelId, { allowUnverified: true })` to
  opt back in for internal dashboards / best-effort estimation.

  **Verified rows (defaults still resolve normally):** `gpt-4o`,
  `gpt-4o-mini`, `claude-sonnet-4`, `claude-opus-4`, `claude-opus-4-1`.

  **Migration**: no user-facing API change. If you were depending on
  pre-flight USD bounds for the speculative IDs above, your `BudgetGuard`
  now falls back to the heuristic and you'll get post-call enforcement
  instead of pre-flight throws. Catch `BudgetExceededError` with
  `preflight: false` if you need to detect that path explicitly.

## 0.3.0

### Minor Changes

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

## 0.2.0

### Minor Changes

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

### Patch Changes

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
