# Benchmarks

This file holds **incremental, in-repo numbers**: SDK overhead on a fixed mock model with **no network**, so anyone can reproduce locally. A first head-to-head **competitor** harness (Ziro vs the Vercel AI SDK) ships here under [Competitor comparison](#competitor-comparison--vs-vercel-ai-sdk); broader multi-provider / Mastra / LangGraph harnesses remain on the [roadmap](./ROADMAP.md) (“Transparent benchmarks every release”).

## How to run

From the repository root:

```bash
pnpm bench
```

This runs Vitest’s benchmark mode on everything under [`packages/core/src/benchmarks/`](packages/core/src/benchmarks/) (glob):

- **Tier 1 (sync mock):** [`core-overhead.bench.ts`](packages/core/src/benchmarks/core-overhead.bench.ts) — `generateText` vs `streamText` + `text()` on an in-memory `LanguageModel` with a synchronous stream pump.
- **Tier 2 (async boundaries):** [`core-async-boundary.bench.ts`](packages/core/src/benchmarks/core-async-boundary.bench.ts) — same short completion, but **one `await Promise.resolve()` before each** streamed chunk (microtasks), approximating adapters that yield between tokens **without** measuring HTTP.
- **Tier 3 (competitor):** [`vs-vercel-ai-sdk.bench.ts`](packages/core/src/benchmarks/vs-vercel-ai-sdk.bench.ts) — Ziro `generateText` vs the Vercel AI SDK's `generateText`, plus a no-SDK baseline, all on a zero-latency mock. See [Competitor comparison](#competitor-comparison--vs-vercel-ai-sdk).

## Capture (single machine)

These figures are **not** comparable across hardware; they illustrate relative cost of streaming vs one-shot on identical logic.

| Field | Value |
| ----- | ----- |
| Command | `pnpm bench` |
| Commit | refresh locally after merge (`git rev-parse HEAD`) |
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

## Competitor comparison — vs Vercel AI SDK

**Methodology (fair + reproducible).** We measure **pure SDK overhead**, not provider latency: both frameworks run their `generateText` against a **zero-latency in-memory mock model** returning identical content/usage, so the only difference is each framework's per-call machinery. No API keys, no network. A no-SDK baseline (`model.generate` directly) anchors the floor. Run:

```bash
pnpm --filter @ziro-agent/core exec vitest bench --run src/benchmarks/vs-vercel-ai-sdk.bench.ts
```

> **What this is / isn't.** This isolates framework call overhead on a trivial completion — it is **not** a claim about real-world latency (where the LLM round-trip dwarfs SDK time), feature parity, or quality. The AI SDK does more per call (multi-step orchestration, schema plumbing) which is exactly what this micro-benchmark strips away. Treat it as a *startup/overhead* signal, not a verdict.

### Results (representative local run, `ai@6.0.197`)

Same machine/Node as the capture table above. Scenario: single text completion (`"Hello"`).

| Benchmark | ops/s (hz) | Mean | vs baseline |
| --------- | ---------- | ---- | ----------- |
| baseline: `model.generate` (no SDK) | ~2,660,000 | ~0.0004 ms | 1× |
| ziro: `generateText` | ~1,340,000 | ~0.0007 ms | ~2× slower |
| vercel-ai-sdk: `generateText` | ~10,800 | ~0.092 ms | ~245× slower |

Interpretation: on this mock-overhead micro-benchmark Ziro's `generateText` adds ~0.3 µs over a raw model call and runs **~120× more calls/sec than the Vercel AI SDK's** `generateText`. Numbers vary by machine and AI SDK version; re-capture locally after bumping `ai`.

## Optional — Groq Cloud latency (network)

Groq is tracked as the Track 3 inference wedge ([`ROADMAP.md`](./ROADMAP.md)). Unlike `pnpm bench`, this hits **live HTTPS** and only runs when **`GROQ_API_KEY`** is present (skipped otherwise — safe for CI).

```bash
export GROQ_API_KEY=...
# Optional override (defaults to llama-3.3-70b-versatile):
# export GROQ_BENCH_MODEL=...

pnpm --filter @ziro-agent/groq bench
```

Capture methodology alongside core benches (machine, Node, commit hash). Numbers vary widely by region and model; use as a **sanity / regression** signal on one machine, not as cross-repo apples-to-apples latency claims.

### Captured Groq run (fill after local bench)

After `pnpm --filter @ziro-agent/groq bench` with `GROQ_API_KEY` set, paste one Vitest summary row here so the doc stays honest between releases.

| Field | Value |
| ----- | ----- |
| Command | `pnpm --filter @ziro-agent/groq bench` |
| Commit | refresh locally (`git rev-parse HEAD`) |
| Model | `llama-3.3-70b-versatile` (default) |
| Node.js | per `.nvmrc` on the capture machine |
| Benchmark | Mean (ms) | ops/s |
| `generateText short prompt` | _skipped in maintainer CI capture — set `GROQ_API_KEY` and re-run locally_ | _fill after run_ |

Maintainers: with `GROQ_API_KEY` exported, run the command above and replace the last row with the Vitest bench summary (mean ms + hz). CI does not require this network bench.

## Next steps

- Cold vs warm runs against reference HTTP providers (pinned versions).
- Agent loop overhead vs comparable loops (methodology TBD).
- Scheduled / manual benchmark workflow: [`.github/workflows/bench.yml`](./.github/workflows/bench.yml).
