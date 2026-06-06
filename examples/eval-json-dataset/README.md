# eval-json-dataset

Declarative **`*.eval.json`** / **`*.eval.yaml`** fixtures (`ziroEvalDataset` v1, `runKind: "modelText"`).

## Run locally

From this directory (after `pnpm install` at repo root so `ziroagent` is linked):

```bash
pnpm smoke
```

Or from repo root:

```bash
pnpm --filter @ziro-agent/example-eval-json-dataset smoke
```

The **`smoke`** script runs:

- `smoke.eval.json`, `contains-smoke.eval.json` — text graders
- `llm-judge-mock.eval.json` — **`llmJudge`** with **`judgeModel.kind: "mock"`** (no API keys)
- `smoke.eval.yaml` — YAML equivalent of JSON smoke
- `recording-smoke.mjs` — **`defineRecordingRegressionEval`** + **`exactMatch`**

Equivalent without the script (after `pnpm build`):

```bash
pnpm exec ziroagent eval examples/eval-json-dataset/smoke.eval.json examples/eval-json-dataset/contains-smoke.eval.json
```

## Format

See [`packages/eval/src/json-dataset.ts`](../../packages/eval/src/json-dataset.ts): graders **`exactMatch`**, **`contains`**, **`regex`**, **`llmJudge`** (requires top-level **`judgeModel`**, v1: **`mock`** only). Each case supplies **`modelText`** and **`expected`** per grader rules.

YAML uses the same schema via [`yaml-dataset.ts`](../../packages/eval/src/yaml-dataset.ts).

**`pnpm run typecheck`** is a no-op here (fixture-only package); CI runs **`pnpm smoke`** in this example via the examples workspace.
