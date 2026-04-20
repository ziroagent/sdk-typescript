# Roadmap

A high-level view of where ZiroAgent SDK is headed. For day-to-day tracking see [GitHub Projects](https://github.com/ziroagent/sdk-typescript/projects).

Our roadmap is shaped by one question: **"What stops 88% of agent projects from reaching production?"** Every milestone below maps to a documented production failure mode (cost runaway, context pollution, integration brittleness, missing observability, multi-agent coordination, no governance).

> **2026-04-22 — v2.** This file was restructured per [RFC 0004](./rfcs/0004-roadmap-v2.md) after a 12-SDK competitive review. The v0.1 section is unchanged; v0.2 onwards is reordered, every milestone now carries an **adoption matrix** (what we keep / reject from competitors), and a v0.1.9 housekeeping milestone is inserted before v0.2. The original ROADMAP remains in git history.

---

## Guiding principles

- **Production-safety > feature breadth.** We will not ship a primitive that doesn't have a budget, retry, and trace story.
- **MCP-first distribution.** Every tool/agent is an MCP server by default — users discover Ziro through Claude Desktop, not through `npm install`.
- **Best-of-breed integration > rebuild.** We adapt Temporal, Inngest, Langfuse, Ollama. We don't compete with them.
- **OSS core, optional managed cloud.** The self-hostable SDK is always fully featured; Ziro Cloud is convenience, never lock-in.
- **Transparent benchmarks every release.** Latency, cost, agent success rate vs. competitors, published in `BENCHMARKS.md`.
- **Adoption is auditable.** Every milestone v0.2+ carries an adoption matrix citing the competitor patterns we keep and the ones we reject — with reasons.

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

## v0.1.9 — Trust recovery (2 weeks, before v0.2 feature work)

**Goal**: close the gap between what `README.md` promises and what npm publishes. **No new primitives.**

This milestone exists because the 12-SDK review (RFC 0004) surfaced eight gaps where shipped code lags shipped marketing — Sovereign pillar empty, three production-safety primitives undocumented on the docs site, README packages table over-claiming, snapshot fidelity missing. Trust compounds; closing these gaps before adding new surface area protects every later milestone.

### Documentation
- [ ] `apps/docs/content/docs/budget-guard.mdx` — pillar #1, currently undocumented on the docs site
- [ ] `apps/docs/content/docs/hitl.mdx` — pillar #2 walkthrough with `agent.resume`
- [ ] `apps/docs/content/docs/evals.mdx` — pillar #3 cookbook with CI gate
- [ ] `apps/docs/content/docs/errors.mdx` — every Ziro error class, brand check, recovery pattern
- [ ] `apps/docs/content/docs/comparison.mdx` — promote `POSITIONING.md` into the site
- [ ] `apps/docs/content/docs/cookbooks/*.mdx` — five recipes: try/catch budget · persist snapshot to Postgres · expose tools as MCP · fallback model on `BudgetExceededError` · RAG with budget cap
- [ ] `apps/docs/content/docs/migration.mdx` — v0.x churn policy explicit
- [ ] Auto-build TypeDoc in CI; commit to `apps/docs/public/api/` so `/api/*` pages stop being 404s
- [ ] Sync `apps/docs/content/docs/getting-started.mdx` CLI invocation with `README.md` (currently mismatched: `pnpm dlx @ziro-agent/cli init` vs `npm create ziro@latest`)
- [ ] Wire the new `apps/docs/content/blog/` route in Fumadocs config

### README accuracy
- [ ] Mark every package row in `README.md` "Packages" table with `shipped (v0.1.x)` or `planned (v0.x)` — currently 17 packages listed, 10 actually published
- [ ] Same for the `examples/` table

### Snapshot completeness (RFC 0002 amend)
- [ ] Add `parsedArgs` to `AgentSnapshot.resolvedSiblings[]` so `agent.resume()` doesn't lose tool-call argument fidelity for already-executed siblings
- [ ] Bump `AgentSnapshot.version` to `2`; ship `migrateSnapshot(v1 → v2)`

### Sovereign pillar credibility
- [ ] **`@ziro-agent/ollama` v0.1.0** — the Sovereign pillar cannot remain empty; this is a 1-week ship and unblocks the VN/SEA wedge

### Pricing data hygiene
- [ ] Add `unverified: true` flag to any `ModelPricing` entry whose `validFrom` cannot be cross-referenced against a live provider page (today: speculative 2026 IDs in `packages/core/src/pricing/data.ts`)
- [ ] `getPricing()` returns `undefined` for `unverified: true` unless `{ allowUnverified: true }` is passed; pre-flight enforcement falls back to chars/4 heuristic, same as for unknown models

---

## v0.2 — Production hardening (8-10 weeks)

**Goal**: ship the four "blow up in production" primitives that unblock paying design-partner upgrades — middleware composition, graceful durability, provider depth, and replayable evals.

### Adoption matrix

| Inspired by                                | Keep                                                                                                          | Reject                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Vercel AI SDK v3-spec / `wrapLanguageModel`| `LanguageModelMiddleware` interface w/ `transformParams` + `wrapGenerate` + `wrapStream`                      | Bundling middleware as separate provider packages — synthetic `@ai-sdk/provider-utils-v5` aliases break pnpm/Vercel deploys |
| LangGraph JS / `Checkpointer`              | 4-method interface (`get` / `put` / `list` / `delete`) + `threadId` + per-thread row-locked checkpoints       | `MemorySaver`-only OSS path with PostgresSaver locked to LangGraph Cloud paid tier              |
| Strands Agents / `SessionManager`          | 3 save strategies (`invocation` / `message` / `trigger`) + UUID v7 immutable snapshot ids                     | AWS Bedrock as 1st-class default; we stay provider-agnostic                                     |
| Mastra / Resumable streams                 | Cached `streamText` events with sequential index, `streamText({ resumeKey })` + adapter Redis                 | `createDurableAgent` / `createEventedAgent` / `createInngestAgent` 3-factory split — too opinionated |
| Inngest / TS-first DX                      | `@ziro-agent/inngest` durable adapter shipped first (Inngest is TS-native; Temporal needs more boilerplate)   | Coupling Inngest backend into core; adapter only                                                |
| OpenAI Agents JS / `experimental_repairToolCall` | `repairToolCall(call, error, ctx) => repairedCall \| null` hook on `agent.run` for malformed JSON args  | Default-on tracing exporter to a single hosted backend (`platform.openai.com/traces`)           |
| Vercel AI SDK / `prepareStep`              | `prepareStep({ stepIndex, messages })` to swap model / inject system / restrict `activeTools` per step        | `experimental_*` proliferation as a versioning escape hatch                                     |

### Track 1 — Middleware layer (week 1-2) — see RFC 0005
- [ ] `LanguageModelMiddleware` interface + `wrapModel(model, middleware[])` in `@ziro-agent/core`
- [ ] **`@ziro-agent/middleware`** new package: `retry()`, `cache()` (LRU + pluggable adapter), `redactPII()` (Presidio adapter), `blockPromptInjection()` (Lakera + heuristic)
- [ ] Tracing instrumentation reuses existing `instrumentModel()` — middleware spans nest under model spans

### Track 2 — Checkpointer + resumable streams (week 3-4) — see RFC 0006
- [ ] `Checkpointer` interface in `@ziro-agent/agent`
- [ ] `@ziro-agent/checkpoint-memory`, `@ziro-agent/checkpoint-postgres`, `@ziro-agent/checkpoint-redis`
- [ ] `agent.resumeFromCheckpoint(threadId)` / `agent.listCheckpoints(threadId)`
- [ ] `streamText({ resumeKey, resumeFromIndex })` with cached event log
- [ ] **Mental model rename**: durable is the *default* (any checkpointer); Temporal/Inngest become the long-running adapters

### Track 3 — Provider depth (week 5-6)
- [ ] `@ziro-agent/google` (Gemini)
- [ ] `@ziro-agent/groq` (fastest inference benchmark wedge)
- [ ] Cache-control parameters surfaced on `@ziro-agent/anthropic` (`cache_control` blocks)
- [ ] `@ziro-agent/openai` prompt-cache control parity

### Track 4 — Durable adapters (week 7-9)
- [ ] **`@ziro-agent/inngest` first** — TS-first DX, ~1 week ship
- [ ] `@ziro-agent/temporal` — uses `@temporalio/ai-sdk` integration as reference but does *not* depend on Vercel AI SDK
- [ ] (Restate adapter deferred to v0.3 — no design-partner demand yet)
- [ ] `examples/durable-support-agent` end-to-end with Inngest

### Track 5 — Evals polish (parallel, throughout)
- [ ] **Replay-from-trace** (deferred from RFC 0003 §Q4) — load OTel `ziro.agent.run` span → reconstruct `EvalCase` → run against new code
- [ ] JSON / YAML datasets accepted by `ziroagent eval` (currently TS-only)
- [ ] Online sampling middleware: `samplingEval({ rate: 0.05 })` writes 5% of production traces into eval store

---

## v0.3 — Sovereign + Multi-agent + Frontend (10-12 weeks)

**Goal**: VN/SEA banking design partners go to production. Multi-agent coordination ships as the smallest possible primitive (handoffs + deterministic router), not a graph framework.

### Adoption matrix

| Inspired by                              | Keep                                                                                              | Reject                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI Agents JS / `handoffs[]`          | `handoffs: Agent[]` field on `CreateAgentOptions` — handoffs auto-expose as tools to the LLM, with `inputFilter` to control message history pass-through | Handoff *graph* visualisation as 1st-class — premature complexity                                     |
| Inngest Agent Kit / state-based router   | `router: (ctx) => Agent \| Agent[] \| undefined` — function-form deterministic only               | LLM-as-router (`createRoutingAgent`) — extra LLM call per step, opaque cost behaviour                 |
| Mastra / Working memory persistence scopes | `WorkingMemory` with `scope: 'resource' \| 'thread'`, markdown-block storage, libSQL+Postgres adapters | Observational Memory full implementation — defer until 1+ design partner asks; Mastra owns this design space |
| Letta / Tiered memory                    | (nothing taken into core)                                                                          | Self-editing memory tools (`core_memory_append`) — security nightmare, surface area too large         |
| AG-UI / 17 standard events               | `@ziro-agent/agui` event emitter; `@ziro-agent/react` with `<Chat>` / `<TraceTimeline>` / `<ToolApproval>` | Custom non-AG-UI event protocol — fragmenting is the worst outcome                                    |
| EU AI Act / hash-chained audit log       | `@ziro-agent/audit` package emitting JSONL with `prevHash` + `eventHash` per record               | Compliance-as-a-cloud-service — must work air-gapped                                                  |

### Track 1 — Sovereign mode
- [ ] `@ziro-agent/vllm`
- [ ] `@ziro-agent/lmstudio`
- [ ] Vietnamese tokenizer / model presets (PhoGPT, VinAI, Viettel AI, FPT.AI)
- [ ] Air-gapped install bundle (single tarball, zero network calls)
- [ ] EU AI Act audit log hash-chained format (`@ziro-agent/audit`)
- [ ] `@ziro-agent/nestjs` integration

### Track 2 — Multi-agent (handoffs + router only) — see RFC 0007
- [ ] `handoffs: Agent[]` on `CreateAgentOptions`
- [ ] `inputFilter: (messages) => messages` per handoff
- [ ] `router?: AgentRouter` — function-form deterministic state-based routing only
- [ ] `examples/multi-agent-handoff` (replaces over-engineered `examples/multi-agent-workflow`)
- [ ] **Reject**: full graph engine like LangGraph — `@ziro-agent/workflow` already covers the small graph case

### Track 3 — Frontend layer
- [ ] `@ziro-agent/agui` — AG-UI 17-event protocol emitter
- [ ] `@ziro-agent/react` — `<Chat>`, `<TraceTimeline>`, `<ToolApproval>`, hooks via SSE
- [ ] Resumable client (uses `streamText({ resumeKey })` from v0.2)

### Track 4 — Memory polish
- [ ] `WorkingMemory` with `scope: 'resource' | 'thread'`
- [ ] `MemoryProcessor` middleware pattern (Mastra-style: trim / summarise / inject)
- [ ] Vector store adapters: Qdrant, Pinecone, Weaviate, Chroma

### Track 5 — Edge & deploy
- [ ] Edge deployment recipes: Cloudflare Workers, Vercel Edge, Deno Deploy, Bun
- [ ] Code Mode (Cloudflare pattern) — generate code instead of 40+ tool calls
- [ ] Compliance pack: EU AI Act audit log format, SOC 2 control mapping, HIPAA-ready handlers

---

## v0.4 — Multi-agent advanced + interop

### Adoption matrix

| Inspired by                          | Keep                                                                       | Reject                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Google A2A protocol                  | A2A wire format adapter as soon as a stable spec lands                     | Inventing a competing protocol                                                          |
| AutoGen v0.4 actor model             | `supervisor / worker` patterns as composition examples (no new primitives) | Cross-language interop bridge — TS-native is the value prop                             |
| Effect-TS                            | Optional `@ziro-agent/effect` adapter package                              | Effect as a core dependency — raises learning curve too much                            |
| anthropic-sdk-python perf regressions| Bench every release; reject any code path that costs >1% CPU on 100KB payloads | Recursive type-introspection on every message payload                                |

- [ ] Supervisor / worker hierarchical patterns documented as composition examples
- [ ] Agent-to-agent (A2A) protocol adapter (when standardised)
- [ ] Workflow graph: conditional routing, parallel branches, compensation steps
- [ ] Native tokenizer (Rust via `napi-rs`) for hot paths — bench-driven
- [ ] Session storage adapters (Redis, Postgres, DynamoDB)
- [ ] Optional `@ziro-agent/effect` adapter

---

## v1.0 — Stability + Ziro Cloud GA

- [ ] **API frozen**, semver-strict from here on
- [ ] **Compatibility commitment table** mapping every v0.x → v1.0 deprecation path
- [ ] **Codemod published alongside breaking changes** (Vercel AI SDK v4→v5 lesson: shipping migration *after* the release loses goodwill)
- [ ] Migration guide from v0.x with `@ziro-agent/codemod` package
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

To avoid the LangChain trap of feature-creep, and informed by RFC 0004's 12-SDK competitive review (2026-04-20), we explicitly say no to:

### Original (v0.1 vintage)
- ❌ Our own LLM provider or fine-tuning service.
- ❌ A "chain" abstraction (`LCEL`-style) — `defineTool` + `agent.run` is the only composition primitive.
- ❌ Notebook-style prompt builders.
- ❌ A no-code visual agent builder (we focus on code-first DX).
- ❌ Re-implementing Temporal/Inngest/Langfuse — we adapt them.
- ❌ Closing the OSS core. Apache-2.0 forever.

### Added by RFC 0004 (with source)
- ❌ **Visual no-code agent builder** — Mastra Playground exists; outside our ICP. *(Source: Mastra)*
- ❌ **Effect-TS as a core runtime dep** — optional adapter only; raises learning curve. *(Source: Reactive Agents)*
- ❌ **Standalone gateway daemon** — Kong / LiteLLM territory; we ship middleware library only. *(Source: LiteLLM)*
- ❌ **Letta-style tiered memory full** — Core/Archival/Recall too heavy for 90% use cases; ship working memory + vector store. *(Source: Letta)*
- ❌ **LLM-based routing agent** — Inngest's `createRoutingAgent` adds opaque LLM call per step; deterministic function router only. *(Source: Inngest Agent Kit)*
- ❌ **Cross-language interop (.NET / Python bridge)** — TypeScript-native is the value prop. *(Source: AutoGen v0.4)*
- ❌ **Self-editing memory tools** (`core_memory_append`, `core_memory_replace`) — security nightmare; agents should not mutate their own system prompt. *(Source: Letta)*
- ❌ **Synthetic npm aliases** (`@ai-sdk/provider-utils-v5` style) — breaks pnpm strict symlinks + Vercel deploys. *(Source: Mastra issue #15248)*
- ❌ **Cloud-only durability** — Checkpointer + adapters always self-hostable. *(Source: LangGraph Platform)*
- ❌ **Default-on tracing to a single hosted backend** — OTel-first, Langfuse / Braintrust / Honeycomb / Datadog all equal. *(Source: OpenAI Agents JS)*
- ❌ **`experimental_*` API prefix as a long-term versioning escape hatch** — promote or remove within 2 minor versions. *(Source: Vercel AI SDK)*
- ❌ **Recursive type-introspection on every message payload** — bench every release; reject any code path that costs >1% CPU on 100KB payloads. *(Source: anthropic-sdk-python issue #1195)*
- ❌ **Opinionated full-stack** — every Ziro primitive is replaceable / unbundleable. No `withMastra(everything)` god-object. *(Source: Mastra)*
- ❌ **Coupling AI SDK V-major version to consumer types** — never expose a 3rd-party `LanguageModelV3` type publicly; keep our `LanguageModel` stable. *(Source: Mastra issue #14351)*
- ❌ **Empty pillars in marketing** — every pillar in `README.md` must map to a *shipped* package by v0.2. *(Source: own retrospective)*
