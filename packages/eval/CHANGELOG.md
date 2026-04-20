# @ziro-agent/eval

## 0.2.3

### Patch Changes

- Updated dependencies [[`16d80c8`](https://github.com/ziroagent/sdk-typescript/commit/16d80c8a829b7ccfec977058ab0f08a828cca468), [`bba9d98`](https://github.com/ziroagent/sdk-typescript/commit/bba9d9813d8375b7bfad3bef37d93531d14c4b2d), [`ec901c8`](https://github.com/ziroagent/sdk-typescript/commit/ec901c8554bc0f4e1577eeff8a5ab1b386c9097a)]:
  - @ziro-agent/core@0.5.0
  - @ziro-agent/agent@0.6.0

## 0.2.2

### Patch Changes

- Updated dependencies [33e8de0]
  - @ziro-agent/agent@0.5.0

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
