# Benchmarks

Reproducible latency comparisons versus other SDKs remain on the [v0.1 roadmap](./ROADMAP.md) (“Transparent benchmarks every release”). This file starts with **incremental, in-repo numbers**: SDK overhead on a fixed mock model with **no network**, so anyone can reproduce locally before we publish multi-provider harnesses.

## How to run

From the repository root:

```bash
pnpm bench
```

This runs Vitest’s benchmark mode against [`packages/core/src/benchmarks/core-overhead.bench.ts`](packages/core/src/benchmarks/core-overhead.bench.ts): `generateText` vs `streamText` + `text()` on the same in-memory `LanguageModel`.

## Capture (single machine)

These figures are **not** comparable across hardware; they illustrate relative cost of streaming vs one-shot on identical logic.

| Field | Value |
| ----- | ----- |
| Command | `pnpm bench` |
| Commit | `f0686d9` |
| Node.js | v25.8.1 |
| pnpm | 10.33.0 |
| Vitest | 4.1.4 |
| OS | darwin (representative maintainer dev machine) |

### Results (Vitest bench summary)

Scenario: two text deltas + `finish`, output text `"Hello"`.

| Benchmark | Mean | ops/s (hz) | vs generateText |
| --------- | ---- | ---------- | --------------- |
| `generateText` | 0.0011 ms | ~899,000 | 1× |
| `streamText` + `text()` | 0.0145 ms | ~69,000 | ~13× slower (Vitest summary: `generateText` ~13× faster than stream path) |

Interpretation: streaming carries higher per-call overhead in this stack (stream machinery + aggregation) even when I/O is removed; real providers dominate wall time in production.

## Next steps

- Cold vs warm runs against reference HTTP providers (pinned versions).
- Agent loop overhead vs comparable loops (methodology TBD).
- Optional CI job with loose thresholds once variance is understood.
