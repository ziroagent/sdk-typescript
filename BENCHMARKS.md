# Benchmarks

Reproducible latency comparisons versus other SDKs remain on the [v0.1 roadmap](./ROADMAP.md) (“Transparent benchmarks every release”). This file starts with **incremental, in-repo numbers**: SDK overhead on a fixed mock model with **no network**, so anyone can reproduce locally before we publish multi-provider harnesses.

## How to run

From the repository root:

```bash
pnpm bench
```

This runs Vitest’s benchmark mode on everything under [`packages/core/src/benchmarks/`](packages/core/src/benchmarks/) (glob):

- **Tier 1 (sync mock):** [`core-overhead.bench.ts`](packages/core/src/benchmarks/core-overhead.bench.ts) — `generateText` vs `streamText` + `text()` on an in-memory `LanguageModel` with a synchronous stream pump.
- **Tier 2 (async boundaries):** [`core-async-boundary.bench.ts`](packages/core/src/benchmarks/core-async-boundary.bench.ts) — same short completion, but **one `await Promise.resolve()` before each** streamed chunk (microtasks), approximating adapters that yield between tokens **without** measuring HTTP.

## Capture (single machine)

These figures are **not** comparable across hardware; they illustrate relative cost of streaming vs one-shot on identical logic.

| Field | Value |
| ----- | ----- |
| Command | `pnpm bench` |
| Commit | `0ff24bb` (latest refresh — replace when you re-run locally) |
| Node.js | v25.8.1 (capture locally; CI bench workflow uses `.nvmrc`) |
| pnpm | 10.33.0 |
| Vitest | 4.1.4 |
| OS | darwin (representative maintainer dev machine) |

### Results — tier 1 (sync mock, representative local run)

Scenario: two text deltas + `finish`, output text `"Hello"`.

| Benchmark | Mean | ops/s (hz) | vs generateText |
| --------- | ---- | ---------- | --------------- |
| `generateText` | ~0.0015 ms | ~678,000 | 1× |
| `streamText` + `text()` | ~0.0103 ms | ~97,000 | ~7× slower (Vitest summary for this run) |

### Results — tier 2 (microtask between each chunk)

Same output; stream pump awaits `Promise.resolve()` before enqueueing each part.

| Benchmark | Mean | ops/s (hz) | vs generateText |
| --------- | ---- | ---------- | --------------- |
| `generateText` + microtask | ~0.0009 ms | ~1,113,000 | 1× |
| `streamText` + `text()` + microtasks | ~0.0119 ms | ~84,000 | ~13× slower (Vitest summary for this run) |

Interpretation: streaming carries higher per-call overhead than one-shot `generateText`, especially when each chunk crosses an async boundary; **network I/O still dominates** real deployments.

## Next steps

- Cold vs warm runs against reference HTTP providers (pinned versions).
- Agent loop overhead vs comparable loops (methodology TBD).
- Scheduled / manual benchmark workflow: [`.github/workflows/bench.yml`](./.github/workflows/bench.yml).
