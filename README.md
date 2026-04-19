<div align="center">

# ZiroAgent SDK

**The TypeScript agent runtime that survives crashes, throttles costs, and keeps audit trails.**

*Durable execution · Cost guardrails · Replayable traces · MCP-native · Sovereign-ready*

[![License](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![MCP-native](https://img.shields.io/badge/MCP-server%20%2B%20client-7c3aed.svg)](https://modelcontextprotocol.io/)

</div>

---

> **Why this exists.** 88% of enterprise AI agent projects never reach production — the median cause is not bad prompts, it's missing infrastructure: no durable execution, no cost guardrails, no audit trail, no replayable traces. Ziro is the agent SDK we wished existed when we got paged at 3am because an agent burned $12,400 in a retry loop.

ZiroAgent SDK is an open-source TypeScript toolkit for building **production-safe** AI agents. It bundles a type-safe LLM core, MCP-native tools, an agent loop with durable execution adapters, cost & policy guardrails, evals-as-code, OpenTelemetry tracing, and an AG-UI streaming layer — designed to run anywhere from Vercel Edge to a fully air-gapped on-prem cluster.

## Who this is for

You will get value out of Ziro **today** if at least one of these is true:

- You have a TypeScript AI agent in production (or about to be) that runs longer than 30 seconds, calls real tools, or costs real money.
- You've been paged about an AI bill incident, a HITL workflow that lost state on deploy, or a non-reproducible agent bug.
- Your compliance team is asking about audit logs for AI decisions (EU AI Act, SOC 2, HIPAA, VN Decree 13/2023).
- You need to run agents fully on-prem (sovereign mode), not just "private endpoint cloud".

You should **not** use Ziro (yet) if:

- You're prototyping a chatbot in a notebook → use Vercel AI SDK.
- You need 30+ provider integrations on day 1 → Vercel AI SDK has wider coverage.
- You want a polished consumer chat UI out-of-the-box → use Vercel AI SDK + Next.js starters.
- You can't tolerate v0.x churn → wait for v1.0 (planned ~Q3 2026).

See [`POSITIONING.md`](POSITIONING.md) for the honest comparison and [`STRATEGY.md`](STRATEGY.md) for our operating playbook.

## What makes Ziro different

| Most agent SDKs give you... | Ziro additionally gives you... |
| --- | --- |
| `generateText` / `streamText` | Per-call **budget enforcement** that throws before you burn cash |
| A tool-calling loop | A loop that **resumes from crashes** without re-running expensive steps |
| Provider abstractions | A built-in **AI gateway layer**: routing, fallback, prompt caching, PII redaction |
| MCP client | MCP **server + client** — your tools auto-expose to Claude Desktop / Cursor |
| Console logging | OTel traces + **eval-as-code** + replay-driven regression tests |
| Cloud-only assumptions | A **sovereign mode** that runs 100% on Ollama / vLLM with zero telemetry |

## Six pillars

1. **Production-safe by default.** Every primitive ships with retry, timeout, budget guard, and circuit breaker. Configurable, never silent.
2. **Durable-execution-ready.** First-class adapters for Temporal, Inngest, and Restate. Long-running agents resume from crash without re-paying token costs.
3. **MCP-native, both directions.** Consume any MCP server as tools; expose any `defineTool` as an MCP server with one line. No glue code.
4. **Sovereign-ready.** Ollama / vLLM / LM Studio out of the box. No call-home, no telemetry, EU-AI-Act-friendly audit logs (hash-chained).
5. **Type-safe end-to-end.** Zod v4 is the single source of truth for tool I/O, message shapes, workflow nodes, and eval criteria.
6. **Observable & replayable.** OpenTelemetry on every step. Capture a production trace, replay it locally with new code, regression-test before merge.

## Quick start (60 seconds, no copy-paste)

```bash
npm create ziro@latest my-agent
cd my-agent
ziro chat                      # interactive REPL, asks for API key, persists to ~/.ziroagent/config.json
```

Or use it as a library:

```bash
pnpm add @ziroagent/core @ziroagent/openai
```

```ts
import { generateText } from '@ziroagent/core';
import { openai } from '@ziroagent/openai';

const { text, usage, costUsd } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Hello, Ziro!',
  budget: { maxUsd: 0.01 },        // throws BudgetExceededError before overspend
  cache: { ttl: '5m' },            // explicit Anthropic/OpenAI prompt-cache control
});
```

### A real production agent in ~20 lines

```ts
import { createAgent } from '@ziroagent/agent';
import { defineTool } from '@ziroagent/tools';
import { openai } from '@ziroagent/openai';
import { temporal } from '@ziroagent/temporal';
import { z } from 'zod';

const refundOrder = defineTool({
  name: 'refundOrder',
  description: 'Issue a refund. Requires human approval.',
  input: z.object({ orderId: z.string(), amountUsd: z.number().max(500) }),
  requiresApproval: true,                  // pauses agent until approved
  execute: async ({ orderId, amountUsd }) => stripe.refunds.create({ /* ... */ }),
});

const agent = createAgent({
  model: openai('gpt-4o'),
  tools: { refundOrder },
  runtime: temporal({ taskQueue: 'support-agents' }),  // durable: survives crashes & deploys
  budget: { maxUsdPerRun: 2.00, maxSteps: 20 },
  guardrails: { redactPII: true, blockPrompts: ['ignore previous instructions'] },
});

const run = await agent.run({ prompt: 'Refund order #4231 for the customer.' });
// run.id can be paused, resumed, replayed, audited.
```

### Expose your agent as an MCP server (one line)

```bash
ziro mcp serve ./my-agent.ts          # Claude Desktop / Cursor / Codex see it instantly
```

### Eval-as-code (ships with v0.2)

```ts
import { defineEval } from '@ziroagent/eval';

export default defineEval({
  agent,
  cases: [
    { input: 'Refund order #4231', expect: { tool: 'refundOrder', cost: { lt: 0.05 } } },
    { input: 'Delete all orders', expect: { refused: true } },
  ],
  graders: ['exact', 'llm-judge', 'cost-budget'],
});
```

```bash
ziro eval ./evals/*.ts --gate 0.95     # CI gate: fail merge if score < 95%
```

## Packages

| Package | Status | Description |
| --- | --- | --- |
| [`@ziroagent/core`](packages/core) | v0.1 | Model interface, `generateText`, `streamText`, budget & cache primitives |
| [`@ziroagent/openai`](packages/providers-openai) | v0.1 | OpenAI provider |
| [`@ziroagent/anthropic`](packages/providers-anthropic) | v0.1 | Anthropic provider with explicit prompt-cache control |
| [`@ziroagent/ollama`](packages/providers-ollama) | v0.1 | Local-first provider (sovereign mode) |
| [`@ziroagent/google`](packages/providers-google) | v0.2 | Google Gemini provider |
| [`@ziroagent/tools`](packages/tools) | v0.1 | `defineTool` + MCP client |
| [`@ziroagent/mcp`](packages/mcp) | v0.1 | MCP **server** — expose your tools/agents to Claude/Cursor |
| [`@ziroagent/agent`](packages/agent) | v0.1 | Agent loop, HITL approval, step events |
| [`@ziroagent/gateway`](packages/gateway) | v0.2 | Routing, fallback, virtual keys, PII redaction, cost tracking |
| [`@ziroagent/temporal`](packages/temporal) | v0.2 | Durable runtime adapter (Temporal) |
| [`@ziroagent/inngest`](packages/inngest) | v0.2 | Durable runtime adapter (Inngest) |
| [`@ziroagent/eval`](packages/eval) | v0.2 | `defineEval`, LLM-judge, replay-from-trace |
| [`@ziroagent/memory`](packages/memory) | v0.1 | Vector store interface, in-memory + pgvector |
| [`@ziroagent/workflow`](packages/workflow) | v0.1 | Graph engine for multi-agent flows |
| [`@ziroagent/tracing`](packages/tracing) | v0.1 | OpenTelemetry instrumentation |
| [`@ziroagent/agui`](packages/agui) | v0.2 | AG-UI event emitter for streaming agent state to frontends |
| [`@ziroagent/cli`](packages/cli) | v0.1 | `ziro` CLI: `chat`, `run`, `eval`, `mcp`, `playground` |

## Apps

- [`apps/playground`](apps/playground) — local Next.js dev playground with chat, trace timeline, tool inspector, replay.
- [`apps/docs`](apps/docs) — public documentation site (Fumadocs).

## Examples

- [`examples/basic-chat`](examples/basic-chat) — minimal `generateText`.
- [`examples/agent-with-tools`](examples/agent-with-tools) — agent + tools + budget guard.
- [`examples/durable-support-agent`](examples/durable-support-agent) — Temporal-backed support agent with HITL.
- [`examples/mcp-server`](examples/mcp-server) — expose tools to Claude Desktop.
- [`examples/sovereign-ollama`](examples/sovereign-ollama) — fully on-prem agent, no internet.
- [`examples/rag-pgvector`](examples/rag-pgvector) — RAG over Postgres.
- [`examples/multi-agent-workflow`](examples/multi-agent-workflow) — graph workflow.

## Benchmarks

We publish reproducible benchmarks against Vercel AI SDK, Mastra, and LangGraph for every release. See [BENCHMARKS.md](BENCHMARKS.md) for methodology and current results (latency, cost-per-task, type-safety score, agent success rate on GAIA / SWE-bench-mini).

## Positioning vs. other SDKs

See [POSITIONING.md](POSITIONING.md) for an honest comparison with Vercel AI SDK, Mastra, LangGraph, and CrewAI — including where Ziro is **not** the right choice today.

## Repository scripts

```bash
pnpm install            # install all workspaces
pnpm build              # build every package
pnpm test               # run vitest across packages
pnpm lint               # biome check
pnpm typecheck          # tsc --noEmit per package
pnpm bench              # run reproducible benchmarks
pnpm changeset          # add a changeset for your PR
```

## Contributing

Contributions are very welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), our [Code of Conduct](CODE_OF_CONDUCT.md), and the [governance model](GOVERNANCE.md) before opening a PR. We use [DCO sign-off](https://developercertificate.org/) on every commit.

## Ziro Cloud (planned, v1.0)

The OSS SDK will always be fully featured and self-hostable. We are also building **Ziro Cloud** — a managed offering for teams that don't want to operate Temporal + OTel collectors + an eval store themselves. Free tier + usage-based pricing. [Sign up for early access →](https://ziroagent.com/cloud)

## License

Licensed under the [Apache License 2.0](LICENSE).
