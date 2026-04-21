# Roadmap

A high-level view of where ZiroAgent SDK is headed. For day-to-day tracking see [GitHub Projects](https://github.com/ziroagent/sdk-typescript/projects).

Our roadmap is shaped by one question: **"What stops 88% of agent projects from reaching production?"** Every milestone below maps to a documented production failure mode (cost runaway, context pollution, integration brittleness, missing observability, multi-agent coordination, no governance).

> **2026-04-22 — v2.** This file was restructured per [RFC 0004](./rfcs/0004-roadmap-v2.md) after a 12-SDK competitive review. The v0.1 section is unchanged; v0.2 onwards is reordered, every milestone now carries an **adoption matrix** (what we keep / reject from competitors), and a v0.1.9 housekeeping milestone is inserted before v0.2. The original ROADMAP remains in git history.
>
> **2026-04-20 — v3.** Extended past v0.3 per [RFC 0008](./rfcs/0008-roadmap-v3.md) after a v0.2 retrospective + fresh sweep of 2026 best-practices for agentic SDKs. The v0.1 / v0.1.9 / v0.2 sections are **unchanged** (only `[ ] → [x]` status updates). Milestones v0.3 → v1.0 are rewritten with a per-feature **gap matrix** (status × P0/P1/P2 tier) and 8 child RFCs (0009–0016) cover the largest P0 surface areas. See RFC 0008 §A for the full 56-feature matrix.

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
- [x] `apps/docs/content/docs/budget-guard.mdx` — pillar #1, currently undocumented on the docs site
- [x] `apps/docs/content/docs/hitl.mdx` — pillar #2 walkthrough with `agent.resume`
- [x] `apps/docs/content/docs/evals.mdx` — pillar #3 cookbook with CI gate
- [x] `apps/docs/content/docs/errors.mdx` — every Ziro error class, brand check, recovery pattern
- [x] `apps/docs/content/docs/comparison.mdx` — promote `POSITIONING.md` into the site
- [x] `apps/docs/content/docs/cookbooks/*.mdx` — five recipes: try/catch budget · persist snapshot to Postgres · expose tools as MCP · fallback model on `BudgetExceededError` · RAG with budget cap
- [x] `apps/docs/content/docs/migration.mdx` — v0.x churn policy explicit
- [x] Auto-build TypeDoc in CI; `apps/docs` `prebuild` runs `typedoc` → `public/api/` (gitignored locally; produced on every docs build / CI `docs` job)
- [x] Sync `apps/docs/content/docs/getting-started.mdx` CLI invocation with `README.md` (currently mismatched: `pnpm dlx @ziro-agent/cli init` vs `npm create ziro@latest`)
- [x] Wire the new `apps/docs/content/blog/` route in Fumadocs config

### README accuracy
- [x] Mark every package row in `README.md` "Packages" table with `shipped (v0.1.x)` or `planned (v0.x)` — currently 17 packages listed, 10 actually published
- [x] Same for the `examples/` table

### Snapshot completeness (RFC 0002 amend)
- [x] Add `parsedArgs` to `AgentSnapshot.resolvedSiblings[]` so `agent.resume()` doesn't lose tool-call argument fidelity for already-executed siblings
- [x] Bump `AgentSnapshot.version` to `2`; ship `migrateSnapshot(v1 → v2)`

### Sovereign pillar credibility
- [x] **`@ziro-agent/ollama` v0.1.0** — the Sovereign pillar cannot remain empty; this is a 1-week ship and unblocks the VN/SEA wedge

### Pricing data hygiene
- [x] Add `unverified: true` flag to any `ModelPricing` entry whose `validFrom` cannot be cross-referenced against a live provider page (today: speculative 2026 IDs in `packages/core/src/pricing/data.ts`)
- [x] `getPricing()` returns `undefined` for `unverified: true` unless `{ allowUnverified: true }` is passed; pre-flight enforcement falls back to chars/4 heuristic, same as for unknown models

---

## v0.2 — Production hardening (8-10 weeks)

**Goal**: ship the four "blow up in production" primitives that unblock paying design-partner upgrades — middleware composition, graceful durability, provider depth, and replayable evals.

> **Status (2026-04).** v0.2 **P0 scope is closed**: Tracks 1–3 and the Inngest adapter (Track 4) shipped. What remains below are **explicit follow-ups**, not v0.2 blockers — either moved to **v0.6 / v0.8 / v0.9** on the RFC 0008 schedule, partner-pulled (**Temporal**, **Groq**), or **examples / eval ergonomics** that can land anytime without re-opening the v0.2 milestone.

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
- [x] `LanguageModelMiddleware` interface + `wrapModel(model, middleware[])` in `@ziro-agent/core`
- [x] **`@ziro-agent/middleware`** new package: `retry()`, `cache()` (in-memory LRU + pluggable adapter), `redactPII()` (heuristic adapter, Presidio adapter pending), `blockPromptInjection()` (heuristic + adapter interface)
- [x] Tracing instrumentation reuses existing `instrumentModel()` — middleware spans nest under model spans

### Track 2 — Checkpointer + resumable streams (week 3-4) — see RFC 0006
- [x] `Checkpointer` interface in `@ziro-agent/agent`
- [x] `@ziro-agent/checkpoint-memory`, [x] `@ziro-agent/checkpoint-postgres`, [x] `@ziro-agent/checkpoint-redis`
- [x] `agent.resumeFromCheckpoint(threadId, options)` — shipped (`createAgent({ checkpointer })` + `checkpointer.get` + `agent.resume`); thin **`agent.listCheckpoints(threadId, opts?)`** delegates to `checkpointer.list` when you only hold the agent reference
- [ ] `streamText({ resumeKey, resumeFromIndex })` with cached event log — moved to v0.6 (RFC 0015 resilience)
- [x] **Mental model rename**: durable is the *default* (any checkpointer); Temporal/Inngest become the long-running adapters

### Track 3 — Provider depth (week 5-6)
- [x] `@ziro-agent/google` (Gemini)
- [ ] `@ziro-agent/groq` (fastest inference benchmark wedge) — moved to v0.8 sovereign track
- [ ] Cache-control parameters surfaced on `@ziro-agent/anthropic` (`cache_control` blocks) — v0.9 stabilisation
- [ ] `@ziro-agent/openai` prompt-cache control parity — v0.9 stabilisation

### Track 4 — Durable adapters (week 7-9)
- [x] **`@ziro-agent/inngest` first** — TS-first DX, ~1 week ship
- [ ] `@ziro-agent/temporal` — moved to v0.6 per RFC 0008 (G5 promoted from P1 if pulled)
- [ ] (Restate adapter deferred to v0.3 — no design-partner demand yet)
- [x] `examples/durable-support-agent` end-to-end with Inngest

### Track 5 — Evals polish (parallel, throughout)
- [ ] **Replay-from-trace** (deferred from RFC 0003 §Q4) — folded into RFC 0015 (v0.6)
- [ ] JSON / YAML datasets accepted by `ziroagent eval` (currently TS-only) — v0.9 stabilisation
- [ ] Online sampling middleware: `samplingEval({ rate: 0.05 })` writes 5% of production traces into eval store — D4 in RFC 0008 (P1, post-v1.0)

---

## v0.3 — Standards & Ecosystem (8 weeks) — see RFC 0008 §C

**Goal**: Ziro becomes a citizen of the 2026 agent ecosystem (MCP servers, OpenAPI tools, OTel GenAI conventions, mock provider, three-layer docs). No new feature surface — only first-class adoption of standards already adopted by Vercel AI SDK v6, OpenAI Agents JS, and Anthropic SDK.

### Adoption matrix

| Inspired by                                  | Keep                                                                                     | Reject                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Anthropic MCP / `mcp serve` pattern          | `ziroagent mcp serve ./tools.ts` exposing `defineTool[]` + `Agent[]` over MCP transports | Bundling an MCP gateway daemon — server is a CLI subcommand, not a long-running platform              |
| Vercel AI SDK v6 / `~standard` Schema        | Tool input schema accepted from any Standard Schema validator                            | Locking the public type surface to a single validator                                                 |
| OpenAPI 3.1 ecosystem                        | `toolsFromOpenAPI(spec, { auth })` in `@ziro-agent/openapi`                              | Auto-generating one tool per HTTP verb with no curation hook — emit factory + filter callbacks       |
| OpenTelemetry GenAI WG (semconv stable 2025) | Rename `ATTR.*` to `gen_ai.*` aliases, retain Ziro-specific attrs under `ziroagent.*`    | Dropping our own `ziroagent.*` namespace — multi-vendor span enrichment requires both                 |
| Vitest / Mocked LLM patterns                 | `mockModel({ responses })` + `recordModel(real)` from `@ziro-agent/core/testing`         | Shipping a separate `@ziro-agent/testing` package — testing utilities live with the contract under test |

### Tracks (P0 only)
- [x] **A5** — OTel GenAI semconv aliases in `@ziro-agent/tracing` (dual-emit one minor)
- [x] **A6** — MCP server (`ziroagent mcp serve <entry.mjs>` + `@ziro-agent/mcp-server`) — see [RFC 0009](./rfcs/0009-mcp-server.md)
- [x] **A7** — Standard Schema (`~standard`) interop in `@ziro-agent/tools` (`defineTool` accepts `StandardSchemaV1`, `zodFromStandardSchema`, `parseAsync` in `executeToolCalls`)
- [x] **B6** — Mock / record provider exposed from `@ziro-agent/core/testing` (`createMockLanguageModel`, `recordLanguageModel`)
- [x] **H3** — OpenAPI → tools generator — `@ziro-agent/openapi` (`toolsFromOpenAPISpec`, `toolsFromOpenAPIUrl`) — see [RFC 0010](./rfcs/0010-openapi-tools.md) (GET-only first slice)
- [x] **M1** — Three-layer docs audit (Quickstart / Tutorial / Reference) in `apps/docs` — TypeDoc wired into `prebuild`; cookbooks + blog live; deeper editorial pass remains incremental

---

## v0.4 — Memory & RAG (8 weeks) — see RFC 0008 §C

**Goal**: a production agent can ingest a 10K-document corpus, retrieve with hybrid + rerank, return cited answers, and persist working / conversation memory across sessions.

### Adoption matrix

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Mastra / Working memory scopes               | `WorkingMemory` with `scope: 'resource' \| 'thread'`, markdown-block storage        | Observational Memory — not yet design-partner-pulled, Mastra owns this design                         |
| LangChain / Document loader registry         | `loadDocument(uri)` autodetect (PDF / CSV / MD / DOCX / image OCR) + adapter pattern | Chain abstraction (`DocumentLoaders` as classes) — keep a pure function adapter                       |
| LlamaIndex / Citation-first responses        | Output type `{ text, citations: [{ chunkId, score, text }] }`                       | Citation as opt-in formatter — citations are first-class on every retrieval call                      |
| BM25 + RRF (Pinecone hybrid, Vespa)          | Hybrid as default in `@ziro-agent/memory`; semantic-only via explicit flag          | One-vector-per-doc design — chunked-then-RRF is the default                                           |
| Cohere / Voyage / BGE rerankers              | `rerank()` middleware composable in retrieval pipeline                              | Coupling reranker to a single provider — ships as `RerankerAdapter` interface                         |

### Tracks (P0 only)
- [x] **E1** — Three-tier memory — `createAgent({ memory })` wires `WorkingMemory`, `MemoryProcessor[]`, `ConversationMemory`, and exposes `longTerm` on `agent.memory`; durable backends + `MemoryProcessor` tracing still follow-up — [RFC 0011](./rfcs/0011-memory-tiers.md)
- [x] **E2** — Citation-first RAG output type — `buildTextWithCitations()`, `TextWithCitations`, `RetrievedChunk` / `toRetrievedChunk()` in `@ziro-agent/memory`
- [x] **E3** — Hybrid search — `MemoryVectorStore` (BM25 + dense + RRF) and `PgVectorStore` (Postgres FTS + dense + RRF); `defaultSearchStrategy: 'hybrid'` on both when lexical + dense are configured — [RFC 0012](./rfcs/0012-rag-hardening.md)
- [x] **E4** — Reranker pipeline — `retrieve({ store, query, reranker })` plus `createCohereReranker` / `createVoyageReranker` (`RerankerAdapter`)
- [x] **E5** — *slice*: `loadDocument()` (local path or `file:` URL) for UTF-8 `.txt` / `.md` / `.csv` / `.json` and `.pdf` when `pdf-parse` is installed; DOCX / image OCR / URI registry still follow-up

---

## v0.5 — Safety & Governance (6 weeks) — see RFC 0008 §C

**Goal**: ship the structural safety primitives that turn the existing heuristic middlewares into an auditable governance layer.

**P0 status:** C1 + C4 + C2 implemented in-repo — publish to npm via changeset + `dev` → `main` per [`RELEASING.md`](./RELEASING.md) (no manual `npm publish`).

### Adoption matrix

| Inspired by                                  | Keep                                                                                                  | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI Agents JS / `requiresApproval` flag   | `mutates: true` heuristic auto-sets `requiresApproval` on `defineTool`                                | Network-egress checks at tool runtime — too late; agent-level egress allowlist instead                |
| Vercel AI SDK / `generateObject` + JSON mode | `generateObject({ schema })` with 1-shot validation-failure repair                                    | Shipping our own JSON-mode shim per provider — providers own this; we wrap                            |
| Mastra / Tenant-scoped budgets               | `withBudget({ tenantId, hard: true })` + cost attribution span attribute                              | Per-tool token caps — too granular; per-agent + per-tenant only                                       |
| Adversarial eval research                    | `@ziro-agent/eval/safety` ships red-team prompt suites with version pinning                           | Auto-running adversarial evals on every PR — opt-in via `pnpm eval --suite=safety`                    |

### Tracks (P0 only)
- [x] **C1** — Default-deny for mutating tools — `defineTool({ mutates: true })` sets `requiresApproval: true` when `requiresApproval` is omitted; explicit `requiresApproval: false` opts out; `mutates` is stored on the tool for audit
- [x] **C4** — Structured output — `generateObject({ model, schema, prompt | messages })` validates with Zod, strips ```json fences, one repair pass by default (`repair: false` to disable); `budget` wraps both attempts; throws `JSONParseError` / `ObjectValidationError` / `NoTextGeneratedError`
- [x] **C2** — Per-tenant budget — `BudgetSpec.tenantId` + `hard: true` (nested `intersectSpecs` coerces function/`truncate` `onExceed` to `'throw'`); `BudgetContext.tenantId`; `@ziro-agent/tracing` sets `ziroagent.budget.tenant_id` / `ziroagent.budget.spec.hard` on budget spans; snapshot serialization includes both fields

---

## v0.6 — Resilience (6 weeks) — see RFC 0008 §C

**Goal**: the SDK survives provider outages, malformed completions, flaky tools, and process crashes — without operator intervention.

**P0 slice (in-repo):** `withFallbackChain`, `repairToolCall` on `executeToolCalls` / `createAgent` / `resume`, `createReplayLanguageModel` — JSONL `recordRun`, circuit-breaker tuning, and Temporal (G5) remain follow-up.

### Adoption matrix

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| LiteLLM / Provider fallback chain            | `withFallbackChain([primary, ...fallbacks])` + optional `shouldFallback` (default: retryable `APICallError`, `TimeoutError`) | LiteLLM's per-call routing config file — keep configuration in code                                   |
| OpenAI Agents JS / `repairToolCall`          | `repairToolCall` on `executeToolCalls` + agent `run` / `resume` (one retry after repair)      | Auto-repair via second LLM call by default — opt-in, cost-aware                                       |
| LangSmith / Trace replay                     | `createReplayLanguageModel` from recorded `generate()` results; `recordLanguageModel` unchanged | Vendor-locked replay format — emit OTel-compatible JSON                                               |
| Speculative execution (Cursor, Vercel)       | (deferred to P2)                                                                    | Premature optimisation — re-evaluate when 3+ design partners cite p99 latency                         |

### Tracks (P0 only)
- [x] **K3** — Model fallback — `withFallbackChain` in `@ziro-agent/core` (static ordering; default retryable/timeout fallback) — [RFC 0015](./rfcs/0015-resilience.md)
- [x] **L1** — *slice*: `createReplayLanguageModel` + `ReplayExhaustedError` in `@ziro-agent/core/testing`; full JSONL record/replay pipeline deferred
- [ ] **G5** — `@ziro-agent/temporal` durable adapter (promoted from P1 if pulled)
- [x] **`repairToolCall`** — `executeToolCalls({ repairToolCall, step })`; `createAgent` / `AgentRunOptions` / `AgentResumeOptions` — RFC 0004 carry-over

---

## v0.7 — Multi-modal & Sandbox (8 weeks) — see RFC 0008 §C

**Goal**: agents handle audio + file inputs and run code / browse the web in sandboxed environments — the two most-cited "missing piece" complaints in the 2026 agent demo cycle.

### Adoption matrix

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic / Google content parts    | `audio`, `file`, `image` parts on `UserMessage.content`; large content via URL handle | Base64 inlining for >1 MB payloads — file handles only                                                |
| E2B / Modal / Daytona                        | `@ziro-agent/sandbox-e2b` adapter implementing `SandboxAdapter` interface           | Bundling an in-process Node VM as the default — sandboxing requires kernel isolation                  |
| Browserbase / Stagehand / Anthropic Computer Use | `@ziro-agent/browser-playwright` adapter + `browse(url, intent)` high-level tool | Reimplementing Stagehand's NL-to-action layer — keep low-level page primitive                         |
| ElevenLabs / Whisper / OpenAI TTS            | (P1) `speak(text, voice)` + `transcribe(audio)` model interfaces                    | Bundling TTS / STT into the chat agent loop — separate model surface                                  |

### Tracks (P0 only)
- [x] **I2** — *slice*: `AudioPart` + `resolveMediaInput`; **OpenAI** `input_audio` (wav/mp3 inline / data URL); **Gemini** `inlineData` / `fileData`; **Anthropic** + **Ollama** reject with `UnsupportedPartError` (Messages API has no audio block yet; Ollama chat is image-only) — [RFC 0014](./rfcs/0014-multimodal-content-parts.md)
- [x] **I3** — *slice*: `FilePart` — **OpenAI** `file` (`file-…` id or base64 `file_data`); **Anthropic** `document` (PDF base64/URL, plain text base64); **Gemini** `inlineData` / `fileData`; **Ollama** unsupported (vision `images[]` only)
- [x] **H4** — *slice*: `SandboxAdapter` + `createStubSandboxAdapter()` in core; `createCodeInterpreterTool({ sandbox })` in `@ziro-agent/tools` (`mutates: true`); reference adapters `@ziro-agent/sandbox-e2b`, `@ziro-agent/sandbox-daytona`, `@ziro-agent/sandbox-modal` — [RFC 0013](./rfcs/0013-sandbox-tools.md)
- [x] **H5** — *slice*: `BrowserAdapter` + stub + `createBrowserGotoTool` / `createBrowserScreenshotTool`; reference adapters `@ziro-agent/browser-playwright`, `@ziro-agent/browser-browserbase` — other managed browser SKUs still optional

---

## v0.8 — Sovereign & Compliance (6 weeks) — see RFC 0008 §C

**Goal**: VN/SEA banking + EU AI Act design partners can deploy air-gapped with a documented compliance posture.

### Adoption matrix

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| vLLM, TGI, LM Studio                         | `@ziro-agent/vllm`, `@ziro-agent/tgi` providers                                     | Hosting a model registry — providers only, no model lifecycle                                         |
| EU AI Act + ISO/IEC 42001 templates          | `@ziro-agent/compliance` ships risk-assessment markdown + control-mapping JSON      | Compliance-as-a-cloud-service — must work fully offline                                               |
| GDPR right-to-erasure                        | `agent.deleteUserData(userId)` propagates across checkpointer + memory + traces     | Storing user-identifiable data in spans by default — span attrs use opaque IDs only                   |

### Tracks (P0 only)
- [ ] **O5** — Compliance starter pack (`@ziro-agent/compliance` + `@ziro-agent/audit`) — see [RFC 0016](./rfcs/0016-compliance-pack.md)
- [ ] **O4** — `@ziro-agent/vllm` + `@ziro-agent/tgi` (promoted from P1 if banking pull)
- [ ] Vietnamese tokenizer / model presets (PhoGPT, VinAI, Viettel AI, FPT.AI) — carried from RFC 0004 v0.3
- [ ] Air-gapped install bundle (single tarball, zero network calls) — carried from RFC 0004 v0.3

---

## v0.9 — Release Candidate stabilisation (4 weeks) — see RFC 0008 §C

**Goal**: freeze API surface; publish migration guide + codemod; close every P0 still open.

- [ ] **B3** — error `code` enum + `docsUrl` rollout across every error class
- [ ] **B5** — `@ziro-agent/codemod` package shipped with `v0-to-v1` transform set
- [ ] **A3** — zero-dep core audit (drop accidental deps from refactors)
- [ ] **F2** — loop-guard defaults documented + asserted in tests
- [ ] **F3** — sub-agent budget propagation hardened
- [ ] **G1** — idempotency-key API formalised on `defineTool`
- [ ] **G2** — auto-checkpoint cadence formalised
- [ ] **M1** — three-layer docs audit pass 2
- [ ] **N1** — `CONTRIBUTING-ADAPTERS.md` published
- [ ] **N2** — release-cadence commitment in `RELEASING.md`
- [ ] **J3** — `SUPPORT-MATRIX.md` published (TS / Node LTS policy)
- [ ] `agent.resumeFromCheckpoint(threadId)` / `agent.listCheckpoints(threadId)` (carried from v0.2 Track 2)
- [ ] JSON / YAML datasets accepted by `ziroagent eval` (carried from v0.2 Track 5)

---

## v1.0 — General Availability — see RFC 0008 §C

- [ ] **API frozen**, semver-strict from this point
- [ ] **Compatibility commitment table** mapping every v0.x → v1.0 deprecation path
- [ ] Every breaking change since v0.1 mapped in `apps/docs/content/docs/migration.mdx`
- [ ] **`@ziro-agent/codemod`** covers every breaking change with an executable transform
- [ ] `BENCHMARKS.md` republished with v1.0 numbers vs. Vercel AI SDK v6, Mastra, OpenAI Agents JS
- [ ] Compliance pack published (RFC 0016)
- [ ] Governance: BDFL → maintainer-vote model (per `GOVERNANCE.md`)
- [ ] **Ziro Cloud GA** — managed durable execution + observability + eval store
  - Free tier (10K agent steps/month)
  - Usage-based pricing ($/agent step + $/GB traces stored)
  - Self-hostable parity always — no feature is cloud-only

---

## Post-v1.0 — P1 hardening backlog (target v1.x within 6 months)

P1 items deferred from v1.0 GA per RFC 0008 tier definitions. Backwards-compatible additions only; no breaking changes once v1.0 freezes the API.

- **B4** — CLI breadth (`dev` watch, `deploy`)
- **C2** / **C3** — Per-tenant budget + egress allowlist (if not promoted to P0)
- **C5** — Adversarial eval suite (`@ziro-agent/eval/safety`)
- **D2** — Cost attribution by tag (tenant / user / session)
- **D3** — Trace replay → Playground integration
- **D4** — Eval-on-trace drift detection sampler
- **E6** — Vector adapters (Qdrant / Pinecone / Weaviate / Chroma)
- **G5** — Temporal durable adapter (if not promoted to P0)
- **I4** / **I5** — Image generation + TTS / STT model interfaces
- **K2** — Semantic cache middleware
- **M2** — RFC index auto-published to docs site
- **O2** — Long-context auto-compress hook
- **O4** — vLLM / TGI providers (if not promoted)
- AG-UI / `@ziro-agent/agui` + `@ziro-agent/react` frontend layer (carried from RFC 0004 v0.3 Track 3)
- `@ziro-agent/nestjs` integration (carried from RFC 0004 v0.3 Track 1)
- Edge deployment recipes (Cloudflare Workers, Vercel Edge, Deno Deploy, Bun) (carried from RFC 0004 v0.3 Track 5)

---

## Future / exploratory (post-v1, P2 / v2.0+)

- **A8** — Agent-to-agent (A2A) protocol adapter (when standardised)
- **H6** — Tool capability manifest + signed marketplace
- **K4** — Speculative execution (parallel models, fastest wins)
- **N3** — Anonymous opt-in telemetry (post legal / UX review)
- **O3** — Prompt versioning UI (dashboard product, not SDK)
- **E7** — Knowledge graph storage
- **I6** — Video parts
- **L3** — Property-based test helpers
- **G6** — S3 cold-tier checkpoint adapter
- `ziro-engine` — standalone durable execution service (separate product)
- Voice agents (Realtime API + WebRTC primitives)
- Enterprise SSO + RBAC for Ziro Cloud (SAML, SCIM)
- Native tokenizer (Rust via `napi-rs`) — bench-driven
- Optional `@ziro-agent/effect` adapter

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
