# Benchmarks

> **Our commitment**: every Ziro release ships reproducible benchmarks against the dominant alternatives. No cherry-picking. If a competitor wins, we publish that. We follow the [Spider-style honest benchmark](https://spider.cloud/blog/firecrawl-vs-crawl4ai-vs-spider-honest-benchmark) discipline.

If you find our methodology unfair or our numbers wrong, please open a PR or an issue with the `benchmarks` label. Benchmark code lives in [`bench/`](bench/) and is runnable with `pnpm bench` on any machine.

---

## What we measure

Five dimensions, each with a clear methodology and reproducible script:

### 1. Latency (P50 / P95 / P99)
- **Setup**: identical prompt, identical model (`gpt-4o-mini` and `claude-3-5-haiku`), warm cache, 1000 runs.
- **Measure**: time-to-first-token (TTFT) and time-to-completion.
- **Excludes**: network from your machine; we run from `us-east-1`.

### 2. Cost-per-task
- **Setup**: a fixed agentic task (e.g. "answer this customer support ticket using the refund tool"), 100 runs.
- **Measure**: total USD per successful completion, including retries.
- **Why**: SDKs that don't expose budget guards routinely overspend 2-5x.

### 3. Type-safety score
- **Setup**: write the same agent in each SDK; introduce a deliberate type error (wrong tool input shape, wrong message role, wrong workflow node type).
- **Measure**: which errors are caught at compile-time vs. only at runtime.
- **Score**: `caught_at_compile / total_intended_errors` × 100.

### 4. Agent success rate
- **GAIA-mini** (subset of GAIA benchmark, 50 tasks): tool-use, multi-step reasoning.
- **SWE-bench-mini** (50 tasks): real-world coding agent capability.
- **Custom production-safety suite** (50 tasks): does the agent recover from rate-limit / 5xx / partial tool failures?
- **Measure**: `% completed within budget` and `% completed within step limit`.

### 5. Bundle size & cold start
- **Setup**: minimal "hello world" agent, bundled with `tsup`.
- **Measure**: bundle size (gzipped), cold-start time on Cloudflare Workers and Vercel Edge.

---

## Comparison set

For every Ziro release we benchmark against:

- **Vercel AI SDK** (latest stable)
- **Mastra** (latest stable)
- **LangGraph TS** (latest stable)
- *(Optional, when relevant)* CrewAI (Python), PydanticAI (Python)

We pin exact versions in [`bench/versions.json`](bench/versions.json) for reproducibility.

---

## Current results

> **Status**: v0.1 in development. First public benchmark publication coincides with the v0.1.0 npm release. This section will be auto-updated by CI on every release.

```
┌─────────────────────────────┬────────┬─────────┬───────────┬───────┐
│ Metric                      │ Ziro   │ Vercel  │ Mastra    │ LangG │
├─────────────────────────────┼────────┼─────────┼───────────┼───────┤
│ TTFT P50 (gpt-4o-mini, ms)  │  TBD   │   TBD   │    TBD    │  TBD  │
│ Cost-per-task (USD)         │  TBD   │   TBD   │    TBD    │  TBD  │
│ Type-safety score (%)       │  TBD   │   TBD   │    TBD    │  TBD  │
│ GAIA-mini success (%)       │  TBD   │   TBD   │    TBD    │  TBD  │
│ Production-safety suite (%) │  TBD   │   TBD   │    TBD    │  TBD  │
│ Bundle size (KB gzipped)    │  TBD   │   TBD   │    TBD    │  TBD  │
│ CF Workers cold start (ms)  │  TBD   │   TBD   │    TBD    │  TBD  │
└─────────────────────────────┴────────┴─────────┴───────────┴───────┘
```

---

## How to reproduce

```bash
git clone https://github.com/ziroagent/sdk
cd sdk
pnpm install
cp bench/.env.example bench/.env       # add OPENAI_API_KEY, ANTHROPIC_API_KEY
pnpm bench                              # ~30 minutes, ~$5 in API spend
pnpm bench:report                       # generates BENCHMARKS.md update
```

To benchmark a single dimension:

```bash
pnpm bench:latency
pnpm bench:cost
pnpm bench:typesafety
pnpm bench:gaia
pnpm bench:bundle
```

To benchmark only against a specific competitor:

```bash
pnpm bench --only=ziro,vercel
```

---

## Methodology details

### Why P95 / P99, not just average
Average latency hides the long tail that breaks production SLAs. We report P50/P95/P99 for every measurement.

### Why "success within budget"
A 100% success rate is meaningless if the agent burned 10x the budget to get there. We always report success rate **conditional on staying within a reasonable budget** ($0.10 / task for GAIA-mini).

### Why we run on `us-east-1`
We benchmark from a single fixed region to make latency comparable. This penalizes Ziro and Vercel AI SDK equally. If you care about latency from `ap-southeast-1`, run `pnpm bench --region=ap-southeast-1`.

### Why we don't include LangChain JS legacy
LangChain JS (non-Graph) is being deprecated in favor of LangGraph. Including it would compare against an end-of-life product.

### Why we publish failures
If Ziro is slower or more expensive than a competitor on a metric, we publish it and explain why. Hiding losses in benchmarks destroys trust faster than losing the benchmark itself.

---

## Historical results

We archive every release's benchmark in [`bench/history/`](bench/history/) so you can track progress over time. Format: `bench/history/v0.1.0.md`, `bench/history/v0.2.0.md`, etc.

---

## Disputing a result

Open an issue with the `benchmarks` label and include:

1. The metric you dispute.
2. The exact command you ran.
3. Your hardware / region / Node version.
4. Your raw output (`pnpm bench --json > my-results.json`).

We will rerun on our infra within 7 days and either correct our published numbers or explain the discrepancy in [`bench/disputes.md`](bench/disputes.md).
