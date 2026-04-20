# ZiroAgent SDK — Release Notes

Versioning is per-package (changesets-driven), but every release publishes
all nine packages in lock-step at the same patch level so users can pin a
single version across the workspace.

> **Note on labels.** The `v0.1.4` / `v0.1.5` / `v0.1.6` headings below are
> **rollout milestones** for RFC 0001 (Budget Guard) — each one corresponds
> to one Changeset that landed in the repo. Because all three milestones
> shipped in the same publish cycle without an intervening release,
> Changesets folded the stacked minor bumps into a single semver bump per
> package. The actual published versions on npm are:
>
> | Package | Published |
> |---|---|
> | `@ziro-agent/core` | **0.2.0** |
> | `@ziro-agent/agent` | **0.2.0** |
> | `@ziro-agent/tools` | **0.2.0** |
> | `@ziro-agent/tracing` | **0.2.0** |
> | `@ziro-agent/openai` | **0.2.0** |
> | `@ziro-agent/anthropic` | **0.2.0** |
> | `@ziro-agent/memory` | **0.1.4** |
> | `@ziro-agent/workflow` | **0.1.4** |
> | `@ziro-agent/cli` | **0.1.4** |
>
> Per-package CHANGELOGs (under each `packages/*/CHANGELOG.md`) attribute
> every entry to its originating milestone, so you can still trace which
> feature came in with which `v0.1.x` rollout.

---

## v0.1.8 — 2026-04-20

**Theme**: Evals as first-class — RFC 0003 lands. `defineEval` + 7 graders + `ziroagent eval` CI gate.

`agent.run` now has a third production-safety primitive paired with Budget Guard (RFC 0001) and HITL (RFC 0002): a typed answer to "did it actually do the right thing?". Authors call `defineEval({ dataset, run, graders })` once per behaviour they care about, then either drive it from their own test runner (`runEval` returns a typed `EvalRun`) or from `ziroagent eval ./evals --gate 0.95` in CI. Every case runs inside its own `withBudget` scope so the existing `BudgetObserver` instrumentation captures spend per case for free; `AgentSuspendedError` is surfaced to graders as `error.kind = 'suspended'` with the captured `AgentSnapshot` attached, so a suspended run is still gradable on cost / latency without crashing the runner.

### `@ziro-agent/eval` (new — `0.1.0`)

- **`defineEval` / `runEval`** — runner with worker-pool concurrency (default 4), per-case `AbortController` honouring caller signals + `timeoutMs`, JSON-serialisable `EvalRun` output by construction. Per-case lifecycle: build budget = `intersectSpecs(spec.budget, case.budget)` → `withBudget(budget, () => spec.run(input, ctx))` → snapshot `BudgetUsage` → run every grader sequentially → aggregate weighted `meanScore` → compute `passed`. Reporter / runner errors are isolated; a thrown grader records `result.passed = false` and continues.
- **7 built-in graders.** `exactMatch` (case + trim options), `contains` (substring + negate), `regex` (RegExp or string + negate), `costBudget` (caps on usd / tokens / llmCalls), `latency` (`maxMs` hard ceiling, plus `p50Ms` / `p95Ms` reported in `details`), `noToolErrors` (introspects `AgentRunResult.steps[].toolResults`), `llmJudge` (LanguageModel-as-judge: rubric is string OR `(input, output, expected) => string`, fences are stripped, JSON object is extracted from chatty replies, scores clamped to [0,1], own optional `budget`).
- **`EvalGate` variants.** `meanScore` (weighted mean ≥ min), `passRate` (fraction of cases where every contributing grader passed), `every` (per-grader threshold), `custom` (user-supplied check). Default gate is `{ kind: 'meanScore', min: 0.95 }`.
- **Reporters.** `formatTextReport(run)` (terminal-ready, stable format) + `toJSONReport(run)` (pretty-printed JSON for PR comments / archival). `evaluateGate(run, gate)` is exported as the canonical gate evaluator so CLI and library share one implementation.
- **Grader composition.** Every grader carries `weight` (default 1) and `contributes` (default true). `contributes: false` lets you report e.g. latency without affecting the case's `meanScore` — useful for soft diagnostics.

### `@ziro-agent/cli` (minor)

- **`ziroagent eval <path-or-glob>...`** new subcommand. Resolves glob patterns via Node's built-in `fs.glob` and walks directories for `.js` / `.mjs` modules; loads each via dynamic `import()`; collects every export that duck-types as `EvalSpec` (`{ name, dataset, run, graders }`); runs them sequentially while their cases run in parallel. Exit codes per RFC 0003: `0` all gates pass, `1` at least one gate fails, `2` loader / configuration error.
- **Flags.** `--gate <number|json>` (number → `meanScore` min; JSON → arbitrary `EvalGate`), `--concurrency <n>`, `--reporter text|json`, `--out <file>` (writes a full JSON report alongside terminal output), `--fail-fast` (aborts after first failing case via `AbortController`), `--grep <pattern>` (filters cases by id / name regex).
- **TypeScript loaders.** Native `import()` is used; for `.ts` evals the recommended invocation is `pnpm tsx ./node_modules/.bin/ziroagent eval ./evals.eval.ts ...` until Node's `--experimental-strip-types` ships in stable.

### Tracing

- `runEval` opens a parent OTel span `ziro.eval.run` (attributes `ziroagent.eval.name`, `ziroagent.eval.case.count`, `ziroagent.eval.gate.passed`, `ziroagent.eval.mean_score`) with one child span per case (`ziro.eval.case`, attributes `ziroagent.eval.case.id`, etc.). No new exporter is required — the existing `instrumentBudget()` from RFC 0001 already reports per-case budget spend through the nested `withBudget`.

### Examples

- **`examples/agent-with-evals/`** — offline support-intent classifier dataset (8 cases, no API keys required) wired through `exactMatch + costBudget + latency`, plus a second `noPiiLeaks` spec demoing `passRate` + negated `contains`. Three entry points: `pnpm start` (single-spec quickstart), `pnpm eval` (programmatic, full text report), `pnpm eval:cli` (drives both specs through `ziroagent eval --gate 0.95`).

### Tests

- **47 new tests in `@ziro-agent/eval`** across all 7 graders + runner (concurrency, timeout → `kind: 'timeout'`, thrown error capture, suspended-run capture, non-contributing graders, gate override via `RunEvalOptions`) + gate evaluator + reporters.
- **5 new CLI tests in `@ziro-agent/cli`** covering happy-path gate pass / fail, `--gate` override, `--out` JSON file, `--reporter json` stdout payload, no-spec / no-pattern error paths. Fixtures live inside the package so workspace symlinks resolve `@ziro-agent/eval`.

### Validation

- `pnpm lint`: clean (10 warnings — all pre-existing).
- `pnpm typecheck` + `pnpm build`: 19 / 19 tasks succeed.
- `pnpm test`: every package green (counts unchanged for existing packages).
- `pnpm --filter @ziro-agent/eval publint`: **All good!**
- `pnpm --filter @ziro-agent/eval attw --profile=node16`: 🟢 across CJS / ESM / bundler / node10.

### Compatibility

- **Pure addition.** New `@ziro-agent/eval` package + new `eval` subcommand on `@ziro-agent/cli`. No breaking changes to `@ziro-agent/core`, `@ziro-agent/agent`, `@ziro-agent/tools`, `@ziro-agent/tracing`, providers, `@ziro-agent/memory`, `@ziro-agent/workflow`. Existing CLI behaviour (`init`, `run`, `playground`) untouched.

### Known limitations / next steps

- **Replay-from-trace** is intentionally deferred (RFC 0003 §Unresolved Q4) — needs a stable OTel attribute schema before it lands. Tracked for v0.1.9.
- **JSON / YAML datasets** for `ziroagent eval` are not yet supported (TS modules only). Promptfoo-style data files land if design partners ask.
- `instrumentEval()` separate from `instrumentBudget()` is not shipped — span emission is built into the runner. Trivial to add later if more than one subscriber needs it.

---

## v0.1.7 — 2026-04-20

**Theme**: Human-in-the-Loop — RFC 0002 lands. Approval gates + suspend/resume.

`agent.run` is no longer "fire-and-forget" for irreversible side effects. Any tool can declare `requiresApproval: true` (or a function returning a boolean), and the loop either (a) resolves the approval inline through a caller-supplied `Approver` callback, or (b) suspends the run by serializing its full state to a JSON `AgentSnapshot` and throwing `AgentSuspendedError`. Callers persist the snapshot in any KV store and call `agent.resume(snapshot, { decisions })` later — message history, pending sibling tool calls, and budget usage carry forward unchanged. This is production-safety primitive #2, paired with RFC 0001 (Budget Guard); both stop the loop **gracefully**, on a typed exception the caller can branch on, the difference being *what* is being guarded (cost vs. side-effects).

### `@ziro-agent/core` (minor)

- **HITL primitives** under `src/hitl/`: `Approver`, `ApprovalRequest`, `ApprovalDecision` (`approve` / `reject` / `suspend`), `ApprovalContext`, `RequiresApproval`, `PendingApproval`, `SerializableBudgetSpec`, `CoreAgentSnapshotFields`. All re-exported from the package root.
- **`ApprovalObserver`** hook + `setApprovalObserver()` (mirrors `BudgetObserver` from RFC 0001). Observer exceptions are swallowed so instrumentation bugs cannot break user code. `fireApprovalRequested` / `fireApprovalResolved` / `fireAgentSuspended` / `fireAgentResumed` helpers expose the lifecycle to subscribers without coupling.
- **`withBudget({ presetUsage })`** new option lets `agent.resume` seed the new budget scope with usage already accumulated before suspension. A multi-day pause cannot accidentally bypass `maxUsd` / `maxLlmCalls` caps. `presetUsage` overrides parent-inherited usage as the seed for the new scope; the parent itself is untouched.
- **Bug fix — `AsyncLocalStorage` under pure ESM.** `getCurrentBudget()` and `getCurrentScope()` previously returned `undefined` when the package was loaded via pure-ESM Node runtimes (`tsx`, `node --import`, etc.) because the lazy `require('node:async_hooks')` shim threw and fell back to `null`. Replaced with a static `import { AsyncLocalStorage } from 'node:async_hooks'`. The package's `engines.node >= 20.10` already guarantees the module is present. **Impact**: implicit budget propagation across `await` boundaries inside the agent loop now works in every Node loader, not just CJS / Vitest.

### `@ziro-agent/tools` (minor)

- **`defineTool({ requiresApproval })`** — boolean (`true` = always require) or function (`(input, ctx) => boolean | Promise<boolean>` for conditional gating, e.g. `(i) => i.amountUsd > 100`).
- **`executeToolCalls({ approver })`** — when an inline approver is provided, it's invoked between input parsing and `tool.execute()`. `decision: 'approve'` proceeds; `'reject'` short-circuits with the reject reason as the tool message the LLM sees; `'suspend'` (or **no approver at all**) short-circuits with a `pendingApproval` field on `ToolExecutionResult` that the agent layer collects into the snapshot. Approver-thrown errors are surfaced as `isError: true` results, not crashes.
- **New result variant** — `ToolExecutionResult.pendingApproval` carries `{ toolCallId, toolName, parsedInput, rawArgs }` for the agent layer to snapshot.

### `@ziro-agent/agent` (minor)

- **`agent.run({ approver, agentId })`** — pass an inline `Approver` to handle approvals in the same tick (CLI prompts, internal allow-list, etc.); pass an `agentId` to tag the snapshot for keyed persistence. With no approver, the loop suspends on the first guarded tool call.
- **`AgentSnapshot`** — JSON-serializable record of `{ messages, step, pendingApprovals, budgetSpec, budgetUsage, scopeId, agentId, createdAt, ... }`. Write it to Postgres / Redis / S3 with `JSON.stringify`; restore with `JSON.parse`. The snapshot is intentionally framework-agnostic — no class instances, no functions, no `Date` objects.
- **`AgentSuspendedError`** + **`isAgentSuspendedError(err)`** — typed exception with `__ziro_suspended__: true` brand for cross-realm safety; carries `snapshot`. The `name` property is `'AgentSuspendedError'`.
- **`agent.resume(snapshot, { decisions, approver?, budget?, ... })`** — apply each pending tool call's decision (`approve` runs the tool, `reject` writes a tool-error message, `suspend` re-suspends), seed `withBudget({ presetUsage: snapshot.budgetUsage })`, then re-enter the same loop. New approvals encountered after resume re-suspend with a fresh snapshot.
- **Internal refactor** — `run()` and `resume()` now share an `iterateLoop(state, runOptions)` driver; `LoopState` carries the mutable per-step state through both paths. Reduces duplicate logic and ensures bug fixes / tracing hooks apply uniformly.

### `@ziro-agent/tracing` (minor)

- **`instrumentApproval()`** — registers an `ApprovalObserver` that opens a `ziro.approval.request` span per pending approval and attaches `ziro.approval.resolved` / `ziro.agent.suspended` / `ziro.agent.resumed` events. Returns `{ unregister, previous }` for clean teardown / chaining (mirrors `instrumentBudget`).
- **New `ATTR.Approval*` / `ATTR.AgentSuspended*` / `ATTR.AgentResumed*` keys** — `ziroagent.approval.tool.name`, `ziroagent.approval.decision`, `ziroagent.approval.reason`, `ziroagent.agent.suspended.step`, `ziroagent.agent.suspended.pending_count`, `ziroagent.agent.resumed.step`, etc.

### Examples

- **New `examples/agent-with-approval/`** — four scripted-mock-model demos, no API key required:
  - `DEMO=approve` — inline approver returns `'approve'`; `tool.execute()` runs in-tick.
  - `DEMO=reject` — inline approver returns `'reject'`; the LLM sees a tool-error message and continues with a fallback reply.
  - `DEMO=suspend` — no approver; suspend → `JSON.stringify` the snapshot to disk → simulate a human approving from another process → `JSON.parse` and `agent.resume()`.
  - `DEMO=budget` — same as `suspend` but with `budget: { maxLlmCalls: 1 }`. The first call consumes the budget; resume seeds `presetUsage` so the second call rejects with `BudgetExceededError`. Proves multi-day pauses cannot bypass cost caps.

### Tests

- `packages/core/src/hitl/observer.test.ts` — observer event forwarding, error swallowing.
- `packages/core/src/budget/preset-usage.test.ts` — `withBudget({ presetUsage })` seeds the scope, intersects with limits, accounts for prior usage during enforcement.
- `packages/tools/src/define-tool.approval.test.ts` — boolean + function `requiresApproval`, all three approver decisions, approver-thrown errors.
- `packages/agent/src/agent.approval.test.ts` — suspend → resume round-trip, inline approve / reject paths, budget continuity across resume, snapshot JSON round-trip.
- `packages/tracing/src/instrument-approval.test.ts` — span / event emission for each lifecycle state.

### RFC

- `rfcs/0002-human-in-the-loop.md` status flipped to **accepted (v0.1.7)**.

### Verified

- `pnpm -r --filter "@ziro-agent/*" --filter "!@ziro-agent/docs" run typecheck` → clean across all SDK packages.
- `pnpm -r --filter "@ziro-agent/*" --filter "!@ziro-agent/docs" run test` → all package suites green (core 72, agent 27, tools 31, tracing 20, memory 32, workflow 15, providers-openai 6, providers-anthropic 8, cli 10).
- `pnpm --filter @ziro-agent/example-agent-with-approval start` → all four demos pass end-to-end.
- `pnpm -w lint` → clean.

### Known issue (pre-existing, not introduced by this release)

- `apps/docs` (Fumadocs site) `typecheck` / `build` fails because `@/.source` and `fumadocs-ui/provider` cannot be resolved. This is a docs-app build pipeline issue independent of the SDK packages and does not affect any published artifact.

---

## v0.1.6 — 2026-04-20

**Theme**: Budget Guard layer 4 — close out RFC 0001.

The streaming abort + custom-resolver work that was scoped out of v0.1.4 / v0.1.5 lands here. With this release, every layer of the SDK that produces tokens or spends dollars (`generateText`, `streamText`, `agent.run`, `executeToolCalls`) participates in a single budget contract — both for hard limits and for graceful-degradation fallbacks. Pricing data drift is now monitored in CI so we don't quietly serve stale `validFrom` timestamps.

### `@ziro-agent/core` (minor)

- **Streaming mid-call abort** (resolves RFC 0001 §Q4). `streamText({ budget })` wraps the provider stream in a budget-aware reader that runs `checkMidStream` per `text-delta` and aborts the underlying HTTP request via a chained `AbortController` as soon as the projected total (`inputTokens + accumulated chars/4 estimate`) crosses the spec's `maxTokens` / `maxUsd`. Pre-flight (before opening the stream) and post-call (when `finish` arrives) enforcement remain unchanged. Providers that respect `ModelCallOptions.abortSignal` will tear down their socket; providers that don't will at minimum see the wrapper stop pulling chunks.
- **`BudgetSpec.onExceed` function form**. Resolvers receive a `BudgetContext` (spec, observed-so-far, scopeId) and return `{ handled: true, replacement }` to substitute a fallback result, or `{ handled: false }` to re-raise. Wired into `generateText`, `streamText`, and `agent.run` at the layer that **owns** the scope (the layer that passed `budget`); inner SDK calls inheriting a scope propagate `BudgetExceededError` so the owner gets to interpret it. Replacement values must be shape-compatible with the calling function's result type — type-parameterized `BudgetResolution<T>` is on the v0.2 roadmap.
- **New primitives** for advanced consumers: `checkMidStream(scope, projectedTokens, projectedUsd)`, `applyResolution(scope, error)`, `resolveOnExceed(scope, error)`. `getCurrentScope` is also re-exported from the package root.
- **Aggregate stream-promise hang fix**. `r.usage()`, `r.finishReason()`, and `r.toolCalls()` previously hung forever when the underlying stream errored — only `r.text()` rejected. All four now reject on stream error and pre-attach a noop `.catch` so an early rejection doesn't surface as an unhandled rejection on Node.

### `@ziro-agent/agent` (patch)

- `agent.run({ budget: { onExceed: fn } })` invokes the resolver when the agent loop's `withBudget` throws and returns the resolver's `replacement` (typed as `AgentRunResult`). Resolver-thrown errors are surfaced with the original `BudgetExceededError` attached as `cause`. `truncate` semantics (v0.1.5) are unchanged.

### `@ziro-agent/tools`, `@ziro-agent/tracing` (patch)

- No API changes; recompiled against the new core. Existing `defineTool({ budget })` and `instrumentBudget()` flows pick up streaming + resolver behaviour transparently.

### Infrastructure

- **`scripts/check-pricing-drift.ts`** parses `packages/core/src/pricing/data.ts` (no `eval`) and warns when any entry's `validFrom` is older than `STALENESS_DAYS` (default 60).
- **`.github/workflows/pricing-drift.yml`** runs the script weekly (Mondays 09:00 UTC), on PRs that touch the pricing table, and on demand via `workflow_dispatch`. PR runs surface a workflow annotation; scheduled runs open / refresh a `pricing-drift` tracking issue. Drift is intentionally warn-only — it's a reminder, not a blocker. Live HTML scraping of provider pricing pages is deferred until we pick a strategy that survives provider page restyles.

### Tests

- `packages/core/src/budget/resolver.test.ts` (5 tests): replacement returned, re-throw on `handled: false`, resolver-thrown errors surface with `cause`, context snapshot accuracy, no-op when no overrun.
- `packages/core/src/streaming/budget-stream.test.ts` (6 tests): pass-through under cap, mid-stream abort surfaces on `text()`, abort flips the chained signal so the provider sees it, `onExceed` function form on pre-flight, back-compat without scope, parent `withBudget` scope respected.
- `packages/agent/src/agent.budget-resolver.test.ts` (4 tests): resolver replacement returned, re-throw on `handled: false`, resolver-thrown error with `cause`, no-op when no overrun.

### Examples

- `examples/budget-guard/index.ts` gains a streaming demo (block 4: long-essay prompt with a 80-token cap that trips mid-stream) and a `generateText` resolver demo (block 5: stub fallback when `maxUsd` refuses pre-flight).
- `examples/agent-with-budget/index.ts` gains a 4th block that wires `onExceed: async (ctx) => ...` to retry on a cheaper model when the flagship blows the budget.

### RFC

- `rfcs/0001-budget-guard.md` status flipped to **accepted (v0.1.6)**. Adoption table marks the streaming layer + function-form resolver + drift CI as shipped. §Unresolved Q4 (mid-stream abort) is resolved; the answer is documented inline.

### Verified

- `pnpm --filter @ziro-agent/core test` → 62 tests passing
- `pnpm --filter @ziro-agent/agent test` → 19 tests passing
- All other package tests remain green
- `pnpm --filter "./examples/*"` typecheck clean
- Drift script returns clean against `validFrom: '2026-04-20'`

---

## v0.1.5 — 2026-04-20

**Theme**: Budget Guard layers 2+3 — agent loop, per-tool declared budgets, OpenTelemetry observability.

Where v0.1.4 shipped the budget primitives (`BudgetSpec`, `withBudget`, `BudgetExceededError`, pre/post-flight enforcement on `generateText` / `streamText`), v0.1.5 wires them into the actual agent loop and exposes them via OTel. The contract is unchanged from RFC 0001 — every nested LLM and tool call inside `agent.run` sees the same `AsyncLocalStorage` scope, and the tighter of (agent budget, tool budget, batch toolBudget) wins.

### `@ziro-agent/agent` (minor)

- `agent.run({ budget, toolBudget })` wraps the loop in `withBudget(budget, ...)` so every nested `generateText` and `executeToolCalls` participates in the same scope. `toolBudget` is intersected per tool call.
- `BudgetSpec.maxSteps` is honored at the agent layer (intentionally ignored at `generateText`); when both `CreateAgentOptions.maxSteps` and `BudgetSpec.maxSteps` are set, the tighter wins.
- `BudgetSpec.onExceed: 'truncate'` returns an `AgentRunResult` with `finishReason: 'budgetExceeded'` and a populated `budgetExceeded` field instead of throwing. Default remains `'throw'` (back-compat).
- New step event `{ type: 'budget-exceeded', info }` emitted just before `agent-finish` in `truncate` mode; new `AgentBudgetExceededInfo` and `AgentFinishReason` types exported.

### `@ziro-agent/tools` (minor)

- `defineTool({ budget })` — per-invocation budget intersected with the surrounding agent budget and any batch-level `toolBudget`.
- `executeToolCalls({ toolBudget })` — apply a default budget to every tool call in a batch.
- `ToolExecutionResult.budgetExceeded` — a `BudgetExceededError` thrown inside a tool is captured here (with `isError: true`) instead of crashing the agent loop. The agent then promotes the first such result back into a budget halt with `origin: 'tool'`.
- Re-exports `getCurrentBudget` from `@ziro-agent/core` so tool authors get one import.

### `@ziro-agent/tracing` (minor)

- `instrumentBudget()` registers a `BudgetObserver` that opens a `ziro.budget.scope` span per `withBudget` call and attaches `usage.update`, `warning`, and `exceeded` events. Returns `{ unregister, previous }` for clean teardown / chaining.
- New `ATTR.Budget*` attribute keys (`ziroagent.budget.spec.*`, `ziroagent.budget.used.*`, `ziroagent.budget.exceeded.*`, `ziroagent.budget.warning.*`, `ziroagent.budget.scope.*`).

### `@ziro-agent/core` (patch)

- New internal-stable hook: `setBudgetObserver()` + `BudgetObserver` interface (subscribers see `onScopeStart`, `onScopeEnd`, `onUsageUpdate`, `onWarning`, `onExceeded`). Observer exceptions are swallowed so instrumentation bugs cannot break user code.
- `intersectSpecs` re-exported from the package root for the tools layer to compose `tool.budget` ∩ `toolBudget`.
- `process.emitWarning` is preserved as the back-compat warning channel — tracing now fires in addition, not instead.

### Examples

- New `examples/agent-with-budget` demonstrates `agent.run({ budget })`, `defineTool({ budget })`, `onExceed: 'truncate'`, and `instrumentBudget()` end-to-end against the OpenAI provider.

### RFC

- `rfcs/0001-budget-guard.md` status updated to **accepted (v0.1.5)** with the v0.1.5 ship notes appended (truncate semantics, intersection rules, mid-tool-execution still deferred).

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
