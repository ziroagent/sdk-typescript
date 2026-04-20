# @ziro-agent/eval

## 0.2.1

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies [082e91a]
- Updated dependencies [cdfad7c]
  - @ziro-agent/agent@0.4.0
  - @ziro-agent/core@0.4.0

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
