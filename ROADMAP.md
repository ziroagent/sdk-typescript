# Roadmap

A high-level view of where ZiroAgent SDK is headed. For day-to-day tracking see [GitHub Projects](https://github.com/ziroagent/sdk-typescript/projects).

Our roadmap is shaped by one question: **"What stops 88% of agent projects from reaching production?"** Every milestone below maps to a documented production failure mode (cost runaway, context pollution, integration brittleness, missing observability, multi-agent coordination, no governance).

---

## Guiding principles

- **Production-safety > feature breadth.** We will not ship a primitive that doesn't have a budget, retry, and trace story.
- **MCP-first distribution.** Every tool/agent is an MCP server by default — users discover Ziro through Claude Desktop, not through `npm install`.
- **Best-of-breed integration > rebuild.** We adapt Temporal, Inngest, Langfuse, Ollama. We don't compete with them.
- **OSS core, optional managed cloud.** The self-hostable SDK is always fully featured; Ziro Cloud is convenience, never lock-in.
- **Transparent benchmarks every release.** Latency, cost, agent success rate vs. competitors, published in `BENCHMARKS.md`.

---

## v0.1 — Foundation (4 weeks, current)

**Goal**: prove the production-safety thesis with a working SDK + CLI + 2 providers + MCP server. Time-to-first-token under 60 seconds.

### Week 1 — Core + CLI + Benchmarks scaffold
- [x] Monorepo (pnpm + Turborepo + Biome + Vitest + Changesets)
- [x] CI: lint, typecheck, test, build, `attw`, `publint`
- [ ] `@ziro-agent/core` — `LanguageModel` interface, `generateText`, `streamText`, error taxonomy
- [ ] **`@ziro-agent/cli` ships day 1** — `ziroagent chat`, `ziroagent run`, interactive API-key setup → `~/.ziroagent/config.json`
- [ ] `npm create ziro@latest` — scaffold an agent in <60s
- [ ] `BENCHMARKS.md` + `pnpm bench` harness (vs. Vercel AI SDK + Mastra)

### Week 2 — Providers + MCP bidirectional + Tools
- [ ] `@ziro-agent/openai` — with explicit prompt-cache control
- [ ] `@ziro-agent/anthropic` — with cache TTL config (5m / 1h)
- [ ] `@ziro-agent/ollama` — local-first, sovereign mode
- [ ] `@ziro-agent/tools` — `defineTool`, parallel calls, JSON schema from Zod
- [ ] **`@ziro-agent/mcp` — server + client both directions.** `ziro mcp serve ./tools.ts`
- [ ] `examples/mcp-server` — published in Claude Desktop ecosystem

### Week 3 — Agent loop + Budget guards + HITL
- [ ] `@ziro-agent/agent` — loop, step events, stop conditions, error recovery
- [ ] **Budget enforcement**: `BudgetExceededError` thrown before overspend, not after
- [ ] **HITL**: `requiresApproval: true` on tools → suspend / resume primitives
- [ ] `@ziro-agent/memory` — vector store interface, in-memory + pgvector
- [ ] `@ziro-agent/workflow` — minimal graph engine
- [ ] `examples/agent-with-tools`, `examples/sovereign-ollama`, `examples/rag-pgvector`

### Week 4 — Tracing + Docs + Release
- [ ] `@ziro-agent/tracing` — OpenTelemetry spans on every LLM call / tool call / agent step
- [ ] `apps/playground` — chat UI + trace timeline + tool inspector + replay
- [ ] `apps/docs` — Fumadocs site, getting-started in 4 languages (EN, VI, JA, KO)
- [ ] **v0.1.0 release** to npm with provenance + GitHub Release + launch post (HN, Reddit, X)
- [ ] First public benchmark numbers published

**v0.1 success criteria**
- `npm create ziro@latest` → working agent in <60s on a fresh machine
- 1000+ GitHub stars within 30 days of launch
- 3 design partners using it in staging
- Benchmarks published, reproducible by anyone

---

## v0.2 — Production hardening (6-8 weeks)

**Goal**: cover the remaining "blow up in production" failure modes — cost, durability, evals, gateway primitives.

### Durable execution (the #1 enterprise gap)
- [ ] `@ziro-agent/temporal` — Temporal worker adapter, agent state as workflow state
- [ ] `@ziro-agent/inngest` — Inngest function adapter
- [ ] `@ziro-agent/restate` — Restate journal adapter
- [ ] HITL approvals lasting hours/days without losing state
- [ ] Resume-from-crash with no token re-payment for completed steps
- [ ] `examples/durable-support-agent`

### Evals as first-class
- [ ] `@ziro-agent/eval` — `defineEval`, LLM-judge, exact-match, cost-budget grader
- [ ] `ziro eval ./evals --gate 0.95` — CI gate
- [ ] **Replay-from-trace** — capture production failure → convert to eval case automatically
- [ ] Online eval sampling on production traffic (configurable %)

### Gateway primitives
- [ ] `@ziro-agent/gateway` — model routing, fallback chains, virtual keys (per-user budgets)
- [ ] PII redaction middleware (pluggable detectors)
- [ ] Prompt-injection guard (Lakera/PromptGuard adapter)
- [ ] Cost tracking export (Stripe Billing / Open Meter / OTel metrics)
- [ ] Tamper-evident audit log (hash-chained, EU-AI-Act-friendly)

### Frontend layer
- [ ] `@ziro-agent/agui` — AG-UI protocol event emitter (17 standard events)
- [ ] `@ziro-agent/react` — `<Chat>`, `<TraceTimeline>`, `<ToolApproval>` components

### Ecosystem providers / stores
- [ ] `@ziro-agent/google` (Gemini), `@ziro-agent/groq`, `@ziro-agent/mistral`
- [ ] Memory adapters: Qdrant, Pinecone, Weaviate, Chroma
- [ ] Tracing exporters: Langfuse, Braintrust, Honeycomb, Datadog

---

## v0.3 — Sovereign & enterprise (8-10 weeks)

**Goal**: make Ziro the default for regulated industries (banking, healthcare, gov) — especially in EU and SEA.

- [ ] **Sovereign mode**: zero-telemetry build flag, air-gapped install bundle
- [ ] vLLM and LM Studio adapters
- [ ] Vietnamese-first presets: PhoGPT, VinAI, Viettel AI, FPT.AI tokenizer & RAG presets
- [ ] Compliance pack: EU AI Act audit log format, SOC 2 control mapping, HIPAA-ready handlers
- [ ] `@ziro-agent/nestjs` integration (most VN/SEA enterprise stacks use Nest)
- [ ] Edge deployment recipes: Cloudflare Workers, Vercel Edge, Deno Deploy, Bun
- [ ] Code Mode (Cloudflare pattern) — generate code instead of 40+ tool calls

---

## v0.4 — Multi-agent & advanced workflows

- [ ] Supervisor / worker hierarchical patterns built-in
- [ ] Agent-to-agent (A2A) protocol support
- [ ] Workflow graph: conditional routing, parallel branches, compensation steps
- [ ] Native tokenizer (Rust via napi-rs) for hot paths
- [ ] Session storage adapters (Redis, Postgres, DynamoDB)

---

## v1.0 — Stability + Ziro Cloud GA

- [ ] **API frozen**, semver-strict from here on
- [ ] Migration guide from v0.x
- [ ] Governance: BDFL → maintainer-vote model (per `GOVERNANCE.md`)
- [ ] **Ziro Cloud GA** — managed durable execution + observability + eval store
  - Free tier (10K agent steps/month)
  - Usage-based pricing ($/agent step + $/GB traces stored)
  - Self-hostable parity always — no feature is cloud-only

---

## Future / exploratory (post-v1)

- `ziro-engine` — standalone durable execution service (separate product)
- Browser-use adapter (Stagehand-style natural language page automation)
- Voice agents (Realtime API + WebRTC primitives)
- Marketplace for verified `defineTool` packages (signed, sandboxed)
- Enterprise SSO + RBAC for Ziro Cloud (SAML, SCIM)

---

## Anti-roadmap (things we will NOT build)

To avoid the LangChain trap of feature-creep, we explicitly say no to:

- ❌ Our own LLM provider or fine-tuning service.
- ❌ A "chain" abstraction (`LCEL`-style) — `defineTool` + `agent.run` is the only composition primitive.
- ❌ Notebook-style prompt builders.
- ❌ A no-code visual agent builder (we focus on code-first DX).
- ❌ Re-implementing Temporal/Inngest/Langfuse — we adapt them.
- ❌ Closing the OSS core. Apache-2.0 forever.
