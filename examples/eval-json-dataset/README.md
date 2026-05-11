# eval-json-dataset

Demonstrates **declarative eval datasets** (`*.eval.json`) run by:

```bash
pnpm exec tsx "$(pnpm root)/../packages/cli/dist/cli.mjs" eval ./smoke.eval.json
```

From the repo root (after `pnpm build`), or from dev:

```bash
pnpm --filter @ziro-agent/cli exec tsx src/cli.ts eval examples/eval-json-dataset/smoke.eval.json
```

## Format

See **`ziroEvalDataset` version 1** in [`packages/eval/src/json-dataset.ts`](../../packages/eval/src/json-dataset.ts): `runKind: "modelText"` supplies synthetic **`modelText`** per case for graders (e.g. `exactMatch`) without executing an LLM.

Full **`defineEval` in TypeScript** remains the primary path for real `run()` implementations.
