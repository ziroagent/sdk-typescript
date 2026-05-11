# eval-json-dataset

Declarative **`*.eval.json`** fixtures (`ziroEvalDataset` v1, `runKind: "modelText"`).

## Run locally

From this directory (after `pnpm install` at repo root so `ziroagent` is linked):

```bash
pnpm smoke
```

Or from repo root:

```bash
pnpm --filter @ziro-agent/example-eval-json-dataset smoke
```

Equivalent without the script (after `pnpm build`):

```bash
pnpm exec ziroagent eval examples/eval-json-dataset/smoke.eval.json examples/eval-json-dataset/contains-smoke.eval.json
```

## Format

See [`packages/eval/src/json-dataset.ts`](../../packages/eval/src/json-dataset.ts): graders **`exactMatch`**, **`contains`** (optional `caseSensitive`, `negate`), **`regex`** (`pattern`, optional `negate`). Each case supplies **`modelText`** (synthetic run output) and **`expected`** as required by the grader (substring for `contains`, full string for `exactMatch`; `regex` ignores `expected`).

**`pnpm run typecheck`** is a no-op here (fixture-only package); CI still typechecks other examples that ship TypeScript.

Full **`defineEval`** in TypeScript remains the path for **`llmJudge`**, live `run()`, and YAML — see the Evals doc page in `apps/docs/content/docs/evals.mdx`.
