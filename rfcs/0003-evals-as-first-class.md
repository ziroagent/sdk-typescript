# RFC 0003: Evals as first-class — `defineEval` + graders + CI gate

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **accepted (v0.1.8)**
- Affected packages: `@ziro-agent/eval` (new), `@ziro-agent/cli`

## Summary

Introduce a first-class evaluation primitive. Authors call `defineEval({ dataset,
run, graders })` once per behaviour they care about, then either drive it from
their own test runner (`runEval(spec)` returns a typed `EvalRun`) or from
`ziroagent eval ./evals --gate 0.95` in CI. Graders are pure
`(input, output, ctx) => GraderResult | Promise<GraderResult>` functions; the
package ships seven built-ins (`exactMatch`, `contains`, `regex`, `llmJudge`,
`costBudget`, `latency`, `noToolErrors`) that compose freely with user-supplied
ones. Every case runs inside its own `withBudget` scope so the existing
`BudgetObserver` + `instrumentBudget()` machinery captures spend per case for
free. Replay-from-trace and online sampling are intentionally deferred.

This is **production-safety primitive #3**, paired with RFC 0001 (Budget Guard)
and RFC 0002 (HITL). Budget answers "did it cost too much?", HITL answers "did
a human approve the side effects?", evals answer "did it actually do the right
thing?". All three stop the loop **gracefully** on a typed signal the caller can
branch on — the difference is *what* is being evaluated (cost vs. side-effects
vs. correctness).

## Motivation

The 2026 AI Agent Incident Report cites correctness regressions — not crashes,
not budget blowouts — as the most common reason production agents get rolled
back. A model swap from `gpt-4o` to `gpt-4o-mini` saved 8× cost but degraded
extraction accuracy from 94% → 71% on a documented support-ticket dataset; the
team noticed three weeks later from customer complaints, not from CI.

Existing TS SDK landscape (Apr 2026):

| SDK | Evals story |
|---|---|
| Vercel AI SDK | None — recommends Vitest snapshots. |
| Mastra | `Mastra.evals` exists but couples to their tracing backend. |
| LangChain JS | `LangSmith` evals — managed-service-only, $25 / seat / mo to gate CI. |
| Promptfoo | Excellent CLI, but framework-agnostic; doesn't see Ziro's `AgentRunResult` (no native budget / step / approval grading). |
| Inspect AI | Python-only. |

Nothing native to TypeScript that:

1. Runs as a library **and** as a CLI gate without a hosted backend.
2. Treats `BudgetExceededError` / `AgentSuspendedError` / tool errors as
   first-class grading signals (not just "the run threw").
3. Captures `AgentSnapshot` + cost + latency per case in the same JSON
   artefact the eval produced — so a failed eval IS a reproducible bug
   report.

`@ziro-agent/eval` fills that gap with the smallest possible primitive.

## Detailed design

### New package: `@ziro-agent/eval`

Exported from package root:

- Types: `EvalCase`, `EvalSpec`, `EvalRun`, `EvalCaseResult`, `Grader`,
  `GraderResult`, `EvalGate`, `RunEvalOptions`, `EvalReporter`.
- Functions: `defineEval`, `runEval`, `formatTextReport`, `toJSONReport`,
  `evaluateGate`.
- Built-in graders (named exports): `exactMatch`, `contains`, `regex`,
  `llmJudge`, `costBudget`, `latency`, `noToolErrors`.

### Core types

```ts
/** A single input → expected pair. `expected` is opaque to the runner;
 *  graders interpret it however they like (string, JSON, schema, …). */
export interface EvalCase<TInput = unknown, TExpected = unknown> {
  /** Stable id; defaults to dataset index if omitted. */
  id?: string;
  /** Human-readable name shown in reports. Defaults to id. */
  name?: string;
  /** What the agent / function under test receives. */
  input: TInput;
  /** Optional ground truth. Many graders need this; some (`costBudget`,
   *  `latency`, `noToolErrors`) don't. */
  expected?: TExpected;
  /** Free-form metadata propagated to GraderContext.case.metadata. */
  metadata?: Record<string, unknown>;
  /** Per-case timeout in ms. Overrides EvalSpec.timeoutMs. */
  timeoutMs?: number;
  /** Per-case budget. Intersected with EvalSpec.budget if both present. */
  budget?: BudgetSpec;
}

export interface EvalSpec<TInput, TOutput, TExpected> {
  name: string;
  description?: string;
  dataset: ReadonlyArray<EvalCase<TInput, TExpected>>;
  /** The thing under test. Receives the case input plus a per-case context
   *  (case id, abortSignal, current budget scope). Returns whatever you
   *  want to grade. */
  run: (
    input: TInput,
    ctx: RunContext,
  ) => Promise<TOutput> | TOutput;
  /** Ordered list. All run; each grader's score contributes to the case's
   *  weighted average (default weight 1). A single grader returning
   *  `passed: false` does NOT short-circuit — we want the full picture. */
  graders: ReadonlyArray<Grader<TInput, TOutput, TExpected>>;
  /** Default budget applied to every case. Per-case `budget` is intersected
   *  via the existing `intersectSpecs` from @ziro-agent/core. */
  budget?: BudgetSpec;
  /** Default per-case timeout. */
  timeoutMs?: number;
  /** Pass/fail aggregation rule. Defaults to `{ kind: 'meanScore', min: 0.95 }`. */
  gate?: EvalGate;
}

export interface RunContext {
  caseId: string;
  caseName: string;
  abortSignal: AbortSignal;
  metadata: Record<string, unknown>;
}

export interface Grader<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  name: string;
  /** When `false`, the grader's score is excluded from the weighted mean.
   *  Useful for diagnostics like `latency` that you want to *report* but
   *  not gate on. Defaults to true. */
  contributes?: boolean;
  weight?: number; // default 1
  grade(
    input: TInput,
    output: TOutput,
    ctx: GraderContext<TInput, TExpected>,
  ): Promise<GraderResult> | GraderResult;
}

export interface GraderContext<TInput, TExpected> {
  case: EvalCase<TInput, TExpected>;
  /** What the runner observed during `run()`. */
  durationMs: number;
  budgetUsage?: BudgetUsage;
  error?: unknown;
  /** Optional snapshot if the run suspended via AgentSuspendedError. */
  agentSnapshot?: AgentSnapshot;
}

export interface GraderResult {
  /** 0..1 inclusive. `1` is a perfect pass; `0` a complete fail. */
  score: number;
  /** Convenience: `true` iff `score >= 0.5`. Graders may override. */
  passed: boolean;
  /** Human-readable explanation surfaced in reports. */
  reason?: string;
  /** Free-form telemetry (e.g. judge model id, raw judge response). */
  details?: Record<string, unknown>;
}

export type EvalGate =
  | { kind: 'meanScore'; min: number } // mean of weighted contributing scores
  | { kind: 'passRate'; min: number }  // fraction of cases where every contributing grader.passed
  | { kind: 'every'; grader: string; min: number } // per-grader threshold
  | { kind: 'custom'; check: (run: EvalRun) => { passed: boolean; reason?: string } };
```

### Result shape

```ts
export interface EvalCaseResult<TInput, TOutput, TExpected> {
  case: EvalCase<TInput, TExpected>;
  output?: TOutput;
  durationMs: number;
  budgetUsage?: BudgetUsage;
  scopeId?: string;
  error?: { name: string; message: string; kind: 'thrown' | 'timeout' | 'suspended' };
  agentSnapshot?: AgentSnapshot;
  graders: Array<{
    grader: string;
    weight: number;
    contributes: boolean;
    result: GraderResult;
    durationMs: number;
    error?: { name: string; message: string };
  }>;
  /** Weighted mean of contributing grader scores; 0 if all errored. */
  meanScore: number;
  passed: boolean; // every contributing grader.passed && no run-level error
}

export interface EvalRun<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  spec: { name: string; description?: string; gate: EvalGate };
  startedAt: string; // ISO
  finishedAt: string;
  durationMs: number;
  cases: ReadonlyArray<EvalCaseResult<TInput, TOutput, TExpected>>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    meanScore: number;
    totalCostUsd?: number;
    totalTokens?: number;
  };
  gate: { passed: boolean; reason: string };
}
```

### `runEval`

```ts
export async function runEval<TInput, TOutput, TExpected>(
  spec: EvalSpec<TInput, TOutput, TExpected>,
  options?: RunEvalOptions,
): Promise<EvalRun<TInput, TOutput, TExpected>>;

export interface RunEvalOptions {
  concurrency?: number; // default 4
  abortSignal?: AbortSignal;
  /** Called after each case finishes. Useful for streaming progress to a
   *  CLI spinner; reporter modules subscribe via `addReporter`. */
  onCaseFinish?: (result: EvalCaseResult<unknown, unknown, unknown>) => void;
  /** Override the spec's gate for this run only (e.g. CLI `--gate 0.9`). */
  gate?: EvalGate;
}
```

Per-case lifecycle:

1. Build a per-case `AbortController` honouring `options.abortSignal` and
   `case.timeoutMs ?? spec.timeoutMs`.
2. Compute the effective budget = `intersectSpecs(spec.budget, case.budget)`.
3. Inside `withBudget(budget, async () => spec.run(input, ctx))`:
   - On `AgentSuspendedError` → record `error.kind = 'suspended'`, capture
     `err.snapshot` into `agentSnapshot`, output is `undefined`. Graders
     still run — `costBudget` and `latency` can still grade a suspended
     run; correctness graders typically fail.
   - On any other thrown error → record `error.kind = 'thrown'`. Graders
     still run with `ctx.error` populated.
   - On `AbortError` from the timeout → `error.kind = 'timeout'`.
4. Snapshot `getCurrentBudget()` immediately before exiting the scope into
   `budgetUsage`. (RFC 0001's `BudgetUsage`.)
5. Execute graders sequentially (cheap; usually 2–5 graders, often pure).
6. Compute `meanScore` and `passed`.

Concurrency is a simple worker-pool over `Promise.all(workers)` — no
external dep. Cases are independent; each opens its own `withBudget` scope
so the parent process has zero shared mutable state.

### Built-in graders

```ts
exactMatch(opts?: { caseSensitive?: boolean; trim?: boolean }): Grader
contains(opts?: { caseSensitive?: boolean }): Grader
regex(pattern: RegExp | string, opts?: { negate?: boolean }): Grader
llmJudge<TInput, TOutput>(opts: {
  model: LanguageModel;
  rubric: string | ((input: TInput, output: TOutput, expected: unknown) => string);
  /** Defaults to "Score 0.0–1.0. Reply with JSON {score, reason}." */
  systemPrompt?: string;
  /** Lift Anthropic / OpenAI tool-use to a structured score. */
  schema?: ZodTypeAny;
  /** Subject the judge model itself to a budget so eval cost is bounded. */
  budget?: BudgetSpec;
}): Grader
costBudget(opts: { maxUsd?: number; maxTokens?: number; maxLlmCalls?: number }): Grader
latency(opts: { p50Ms?: number; p95Ms?: number; maxMs?: number }): Grader
noToolErrors(): Grader
```

Each is implemented as a small named factory returning a `Grader` — they
compose:

```ts
graders: [
  exactMatch({ trim: true }),
  costBudget({ maxUsd: 0.02 }),
  latency({ maxMs: 8000 }),
  llmJudge({ model: gpt4oMini, rubric: 'Is the answer factual and concise?' }),
],
```

### Reporters

Two are shipped; both accept `EvalRun` and return a string. Splitting
formatting from running keeps the runner pure and lets users pipe results
into Slack / Markdown / GitHub PR comments.

```ts
export function formatTextReport(run: EvalRun): string;
export function toJSONReport(run: EvalRun): string; // pretty-printed JSON
```

### `evaluateGate`

Centralises gate evaluation so both `runEval` and `ziroagent eval` use the
same logic. Returns `{ passed, reason }` based on the gate kind. Available
as a public API for users who want to gate on a different field than what
the spec specifies.

### CLI integration: `ziroagent eval`

```
ziroagent eval <path-or-glob>... [options]

Loads each path (file or glob) as an ES module via `tsx`. Each module's
default export OR every named export matching `EvalSpec` is collected.

Options
  --gate <number|spec>   Override gate. Number → meanScore min. (default 0.95)
                         Spec → JSON like '{"kind":"passRate","min":0.9}'.
  --concurrency <n>      Default 4.
  --reporter <text|json> Default text. JSON goes to stdout for piping.
  --out <file>           Also write a full JSON report to <file>.
  --fail-fast            Stop on first failing case.
  --grep <pattern>       Filter cases by name regex.

Exit codes
  0  All evals passed their gates.
  1  At least one eval failed its gate.
  2  Loader / configuration error (no specs found, syntax error, …).
```

The CLI lives in `@ziro-agent/cli` and depends on `@ziro-agent/eval`. Its
job is:

1. Resolve globs (built-in `fs.glob` from Node 22+, with a small fallback
   for 20.x).
2. Dynamic-import each file. Collect all values whose shape matches
   `EvalSpec` (duck-typed: has `name`, `dataset`, `run`, `graders`).
3. Run them sequentially (each spec already parallelises its cases).
4. Print a per-spec text report; print an aggregate gate summary; exit
   with the appropriate code.

### Tracing

Eval runs are themselves observable: `runEval` opens a parent OTel span
named `ziro.eval.run` with attributes
`ziroagent.eval.name`, `ziroagent.eval.case.count`,
`ziroagent.eval.gate.passed`, `ziroagent.eval.mean_score`. Each case is a
child span named `ziro.eval.case` with `ziroagent.eval.case.id`, etc. We
do not ship a separate `instrumentEval()` for v0.1.8 — the existing
`instrumentBudget()` already captures per-case budget spend through the
nested `withBudget`.

### Persistence (deferred)

`EvalRun` is JSON-serialisable by construction (no functions, no class
instances except `agentSnapshot` which is already JSON-safe per RFC 0002).
A future `@ziro-agent/eval-store` can stamp runs into Postgres / S3, but
v0.1.8 only ships the in-process types.

## Drawbacks

- **Yet another testing tool**. Users already have Vitest. We mitigate
  this by **not** building a runner shell — `runEval` is callable from
  inside `it()` if desired. The CLI is a convenience for CI gates that
  don't want to wire eval cases into Vitest's reporter graph.
- **`llmJudge` cost**. Judge models cost money. We mitigate by exposing
  a `budget` option per judge and by recommending `gpt-4o-mini` /
  `claude-3-5-haiku` in docs. The `costBudget` grader catches forgotten
  caps.
- **Grader composition is multiplicative on cost**. A 100-case dataset
  with one `llmJudge` is 100 LLM calls, not 1. We document this in
  `examples/agent-with-evals/` and recommend small datasets per spec.

## Alternatives

1. **Wrap Promptfoo.** Promptfoo is excellent but framework-agnostic; it
   doesn't see `AgentRunResult`, `AgentSnapshot`, or `BudgetUsage`, so
   it can't grade "the run completed under $0.05" without bespoke
   parsing. We could ship a Ziro-aware Promptfoo plugin instead, but
   that ties Ziro CI gates to the Promptfoo CLI. Rejected — too much
   indirection for primitive #3.
2. **Use `Vitest` extensions only.** Works for unit-shaped evals but
   collapses for `passRate` gates spanning many cases, and has nowhere
   to put per-case `budgetUsage`.
3. **LangSmith / Braintrust SDK adapter.** Hosted-only; v0.2 will ship
   exporter packages but the **primitive** must be local.
4. **Replay-from-trace as v0.1.8 scope.** Tempting (it's the killer
   feature) but requires a stable trace format we haven't specced. Lands
   in v0.1.9 once we've shipped enough OTel attributes to confidently
   reconstruct an `EvalCase` from a trace.

## Adoption strategy

Pure addition. No breaking changes:

- New package `@ziro-agent/eval` (minor `0.1.0` first cut).
- `@ziro-agent/cli` gets a new subcommand (minor bump). Existing
  `ziroagent chat` / `run` / `init` are untouched.

Authors who don't run evals can ignore the package entirely. Authors who
do can adopt incrementally — start with `exactMatch`, add `costBudget`
once they see eval cost grow, layer `llmJudge` for soft graders.

## Unresolved questions

- **Q1.** Should `ziroagent eval` support `.json` / `.yaml` datasets the
  way Promptfoo does, in addition to TypeScript modules?
  *Provisional answer*: not in v0.1.8. Keep one source of truth (TS) for
  now. Add a thin loader in v0.1.9 if design partners ask.
- **Q2.** Should we ship `instrumentEval()` analogous to
  `instrumentBudget()` / `instrumentApproval()`?
  *Provisional answer*: not for v0.1.8. The runner emits OTel spans
  directly; a separate observer is only useful when there are multiple
  subscribers, which there aren't yet. Trivial to add later.
- **Q3.** How do we surface judge-model **uncertainty** (e.g. judge
  returned `score: 0.6` with `confidence: 0.4`)?
  *Provisional answer*: store under `GraderResult.details` for v0.1.8;
  promote to a top-level field if a grader needs it for gating.
- **Q4.** Replay-from-trace formal spec.
  *Provisional answer*: deferred to RFC 0004 once OTel attribute
  coverage is locked.
