# RFC 0008: Roadmap v3 — toward v1.0 (best-practices 2026 absorption)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **draft**
- Affected packages: meta — modifies `ROADMAP.md`, spawns RFCs 0009–0016, no source code change

## Summary

Restructure `ROADMAP.md` v0.3 → v1.0 to absorb the **56 best-practices for Agentic
SDKs in 2026** identified during the v0.2 retrospective and a fresh sweep of the
2026 SDK landscape (Vercel AI SDK v6.x, Mastra, OpenAI Agents JS, LangGraph JS,
Pydantic AI, Smolagents, Inngest Agent Kit, Letta, Convex Durable Agents, Genkit,
LiteLLM, AutoGen 0.4). Where RFC 0004 (April 2026) reordered v0.2 around
*production hardening* primitives (middleware + checkpointer + handoffs), this
RFC takes the next step: **define the path from v0.2.x to a feature-frozen v1.0**.

Three structural changes vs. RFC 0004:

1. **Gap matrix on every primitive, not every milestone.** RFC 0004 introduced an
   adoption matrix per milestone. RFC 0008 adds a **gap matrix per feature**
   (status `OK` / `PARTIAL` / `GAP` × tier `P0` / `P1` / `P2`) so contributors
   can immediately see what's left to build before v1.0 GA.
2. **Tiered milestone schedule v0.3 → v1.0.** Each milestone groups 3-5 P0
   features. P1 ships in v1.x (post-GA). P2 is research / v2.0+.
3. **One feature, one RFC.** RFC 0008 spawns eight child RFCs (0009–0016)
   covering the eight largest P0 surface areas. Each child RFC is gated on
   adoption-partner pull, not on this RFC's merge.

Like RFC 0004, this is a **governance change** under `GOVERNANCE.md` §Decision-
making. It introduces no runtime API; merging only updates `ROADMAP.md` and adds
eight RFC stubs.

## Motivation

The v0.2.x train (RFC 0004 → 0007) shipped the production-hardening primitives.
A fresh sweep against the broader 2026 SDK landscape surfaces four issues that
RFC 0004 did not address.

### Issue 1 — RFC 0004's milestone matrix stops at v0.3

RFC 0004 covers v0.2 in detail, v0.3 at medium fidelity, v0.4 + v1.0 in 4-line
bullets. With v0.2 substantially complete (middleware, three checkpointer
adapters, four providers, Inngest, multi-agent handoffs all merged April 2026),
the bottleneck shifts: contributors and design partners cannot see what
"v1.0-ready" means. Without a gap matrix tied to v1.0, the project either drifts
into perpetual v0.x or freezes prematurely.

### Issue 2 — The 2026 wishlist outgrew the 2025 ICP

When RFC 0004 was written (April 2026, two days before this RFC), the
competitive set was 12 TS/Python SDKs. Two months of ecosystem motion has added
new must-haves:

- **MCP servers are now first-class** (Anthropic + OpenAI + Cursor all consume
  MCP). Today we ship a **client-only** adapter (`packages/tools/src/mcp`).
  Without `ziroagent mcp serve` we lose distribution: a Ziro tool cannot be
  installed in Claude Desktop / Cursor without bespoke wrapping.
- **OpenTelemetry GenAI semantic conventions stabilised** (`gen_ai.system`,
  `gen_ai.usage.input_tokens`, etc.). Our `ATTR.*` keys do not yet follow them,
  blocking native Langfuse / Phoenix / Honeycomb dashboards.
- **Code & browser sandboxes (E2B, Browserbase, Modal) are now baseline.**
  Every "production agent" demo in 2026 includes one. We ship neither.
- **Standard Schema (`~standard`) interop** is the de-facto contract for tool
  schemas in TS land. Vercel AI SDK v6, Hono, tRPC, Drizzle all adopt. We
  document Zod, but do not promise the cross-validator contract.
- **Reasoning-model token accounting** (Claude extended thinking, OpenAI
  o-series, Gemini thinking) is a new line item in pricing. Our pricing layer
  conflates reasoning tokens with output tokens, mis-billing by 2-10×.

### Issue 3 — Memory and RAG are still v0.1-shape

Memory currently ships `MemoryVectorStore` + `pgvector` + `chunkText` +
`OpenAIEmbedder`. That covers basic RAG. It does **not** cover:

- **Working memory** (per-run scratchpad with auto-trim).
- **Conversation memory** (sliding window + auto-summarise on overflow).
- **Hybrid search** (semantic + BM25 + RRF).
- **Reranking** as a middleware step.
- **Document ingestion** beyond plain text (PDF, CSV, MD, DOCX, image OCR).
- **Citation-first retrieval** (every RAG answer ties chunk IDs to spans of
  the response).

Of these, citations and hybrid+rerank are the most-requested by design
partners — both for quality and for EU AI Act audit trails.

### Issue 4 — Safety / governance has surface but not depth

`@ziro-agent/middleware` ships `redactPII` and `blockPromptInjection`. Both are
heuristic-only. They satisfy the demo but not a SOC 2 audit. v1.0 needs:

- **Default-deny on mutating tools** (auto-`requiresApproval` heuristic).
- **Egress allowlist** at agent level.
- **Structured-output enforcement** with auto-repair (`generateObject` with
  schema + 1-shot retry on validation failure).
- **Per-tenant budget scopes** (today: per-run only).
- **Adversarial eval suite** (red-team prompt presets).
- **Compliance starter pack** (EU AI Act risk doc, SOC 2 control map, GDPR
  data deletion handler).

## Detailed design

This RFC modifies one file (`ROADMAP.md`) and creates eight stub RFCs. The
gap matrix and milestone schedule below become the new `ROADMAP.md` content.

### A. Gap matrix (56 features, 16 groups)

Each row carries:

- **ID** — stable identifier, citeable from issues / PRs.
- **Status** — `OK` (shipped), `PARTIAL` (shipped but incomplete vs. 2026
  baseline), `GAP` (not shipped).
- **Tier** — `P0` (blocks v1.0 GA), `P1` (post-GA hardening, target v1.x in 6
  months), `P2` (research / v2.0+).
- **Owner** — package or RFC that will ship it.

Status reflects the codebase as of 2026-04-20 (post RFC 0004-0007 merges).

#### Group A — Architecture & Foundation

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| A1  | Layered, swappable adapters (no vendor lock)         | OK       | —    | meta (architecture invariant)     |
| A2  | Structural typing > class hierarchy                  | OK       | —    | meta                              |
| A3  | Zero-dep core                                        | PARTIAL  | P0   | `@ziro-agent/core` (audit)        |
| A4  | Streaming-first (events as primary surface)          | OK       | —    | `@ziro-agent/core`                |
| A5  | OpenTelemetry GenAI semantic conventions             | PARTIAL  | P0   | `@ziro-agent/tracing` (rename `ATTR.*`) |
| A6  | MCP standard alignment (client + server)             | PARTIAL  | P0   | RFC 0009                          |
| A7  | Standard Schema (`~standard`) interop                | PARTIAL  | P0   | `@ziro-agent/tools`               |
| A8  | A2A protocol adoption                                | GAP      | P2   | v2.0+ (spec not stable)           |

#### Group B — Developer Experience

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| B1  | Quickstart < 20 LOC, no config                       | OK       | —    | `@ziro-agent/cli` template        |
| B2  | Type inference for tools (no manual generics)        | OK       | —    | `@ziro-agent/tools`               |
| B3  | Error model w/ `code` enum + `docsUrl`               | PARTIAL  | P0   | `@ziro-agent/core/errors`         |
| B4  | CLI breadth (`init`, `dev` watch, `deploy`, `mcp`)   | PARTIAL  | P1   | `@ziro-agent/cli`                 |
| B5  | Migration codemods                                   | GAP      | P0   | `@ziro-agent/codemod` (new)       |
| B6  | Mock provider in `@ziro-agent/core/testing`          | PARTIAL  | P0   | `@ziro-agent/core` (expose)       |

#### Group C — Governance & Safety

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| C1  | Default-deny for mutating tools (`mutates: true`)    | PARTIAL  | P0   | `@ziro-agent/tools`               |
| C2  | Per-tenant + per-agent budget hard cap               | PARTIAL  | P1   | `@ziro-agent/core/budget`         |
| C3  | Egress allowlist at agent level                      | GAP      | P1   | `@ziro-agent/agent`               |
| C4  | Structured output enforcement (`generateObject`)     | PARTIAL  | P0   | `@ziro-agent/core`                |
| C5  | Adversarial eval suite (red-team presets)            | GAP      | P1   | `@ziro-agent/eval/safety`         |

#### Group D — Observability

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| D1  | Span hierarchy `agent.run` → `step` → `tool` → `llm` | OK       | —    | `@ziro-agent/tracing`             |
| D2  | Cost attribution by tag (tenant, user, session)      | PARTIAL  | P1   | `@ziro-agent/tracing`             |
| D3  | Trace replay → Playground integration                | GAP      | P1   | `apps/playground`                 |
| D4  | Eval-on-trace (drift detection sampler)              | GAP      | P1   | `@ziro-agent/eval`                |

#### Group E — Memory & Context

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| E1  | Three-tier memory (working / conversation / long)    | PARTIAL  | P0   | RFC 0011                          |
| E2  | Citation-first RAG (chunk IDs in output)             | GAP      | P0   | RFC 0012                          |
| E3  | Hybrid search default (semantic + BM25 + RRF)        | GAP      | P0   | RFC 0012                          |
| E4  | Reranker as middleware                               | GAP      | P0   | RFC 0012                          |
| E5  | Document ingestion pipeline (PDF / CSV / OCR)        | GAP      | P0   | RFC 0012                          |
| E6  | Vector adapters (Qdrant / Pinecone / Weaviate)       | GAP      | P1   | RFC 0012                          |
| E7  | Knowledge graph storage                              | GAP      | P2   | v2.0+                             |

#### Group F — Multi-agent

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| F1  | Handoff-as-tool (no god orchestrator)                | OK       | —    | `@ziro-agent/agent`               |
| F2  | Loop guards (`maxHandoffs`, `maxSteps`, `maxDuration`) | PARTIAL  | P0   | `@ziro-agent/agent`               |
| F3  | Sub-agent isolation (budget / context filter)        | PARTIAL  | P0   | `@ziro-agent/agent`               |

#### Group G — Durable Execution

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| G1  | Idempotency keys per tool call                       | PARTIAL  | P0   | `@ziro-agent/tools`               |
| G2  | Auto-checkpoint at tool boundary                     | PARTIAL  | P0   | `@ziro-agent/agent`               |
| G3  | Multiple checkpoint backends (mem / pg / redis)      | OK       | —    | `@ziro-agent/checkpoint-*`        |
| G4  | Inngest durable adapter                              | OK       | —    | `@ziro-agent/inngest`             |
| G5  | Temporal durable adapter                             | GAP      | P1   | `@ziro-agent/temporal`            |
| G6  | S3 cold-tier checkpoint adapter                      | GAP      | P2   | `@ziro-agent/checkpoint-s3`       |

#### Group H — Tool Ecosystem

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| H1  | MCP client adapter                                   | OK       | —    | `@ziro-agent/tools/mcp`           |
| H2  | MCP server (`ziroagent mcp serve`)                   | GAP      | P0   | RFC 0009                          |
| H3  | OpenAPI → tools generator                            | GAP      | P0   | RFC 0010                          |
| H4  | Code interpreter sandbox (E2B / Modal)               | PARTIAL  | P0   | `@ziro-agent/sandbox-e2b`, `@ziro-agent/sandbox-daytona`, `@ziro-agent/sandbox-modal` — RFC 0013 |
| H5  | Browser tool (Playwright / Browserbase)              | PARTIAL  | P0   | `@ziro-agent/browser-playwright`, `@ziro-agent/browser-browserbase` — RFC 0013 |
| H6  | Tool capability manifest (signed marketplace)        | GAP      | P2   | v2.0+ (marketplace product)       |

#### Group I — Multi-modal

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| I1  | Image input (vision)                                 | OK       | —    | `@ziro-agent/core/types/content`  |
| I2  | Audio input (STT-via-model)                          | GAP      | P0   | RFC 0014                          |
| I3  | File / PDF parts                                     | GAP      | P0   | RFC 0014                          |
| I4  | Image generation model interface                     | GAP      | P1   | RFC 0014                          |
| I5  | TTS / STT model interfaces                           | GAP      | P1   | RFC 0014                          |
| I6  | Video parts                                          | GAP      | P2   | v2.0+                             |

#### Group J — Distribution & Versioning

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| J1  | ESM-first w/ subpath exports + `sideEffects: false`  | OK       | —    | every package                     |
| J2  | npm provenance                                       | OK       | —    | `release.yml`                     |
| J3  | TypeScript / Node LTS policy doc                     | GAP      | P0   | `SUPPORT-MATRIX.md` (new)         |

#### Group K — Performance

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| K1  | Parallel tool execution                              | OK       | —    | `@ziro-agent/tools`               |
| K2  | Semantic cache (similarity-based)                    | GAP      | P1   | `@ziro-agent/middleware`          |
| K3  | Model fallback chain                                 | GAP      | P0   | RFC 0015                          |
| K4  | Speculative execution (parallel models)              | GAP      | P2   | v2.0+                             |

#### Group L — Testing

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| L1  | Snapshot record / replay                             | GAP      | P0   | RFC 0015                          |
| L2  | Eval as CI gate                                      | OK       | —    | `@ziro-agent/eval` + CLI          |
| L3  | Property-based test helpers for tool schemas         | GAP      | P2   | `@ziro-agent/core/testing`        |

#### Group M — Documentation

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| M1  | Three-layer docs (Quickstart / Tutorial / Reference) | PARTIAL  | P0   | `apps/docs`                       |
| M2  | RFC index auto-published to docs site                | GAP      | P1   | `apps/docs`                       |
| M3  | Decision records (ADR / RFC discipline)              | OK       | —    | `rfcs/`                           |

#### Group N — Community & Ecosystem

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| N1  | Plugin / adapter contribution guide                  | GAP      | P0   | `CONTRIBUTING-ADAPTERS.md` (new)  |
| N2  | Public release cadence commitment                    | PARTIAL  | P0   | `RELEASING.md`                    |
| N3  | Anonymous opt-in telemetry                           | GAP      | P2   | post-v1.0 (legal review)          |

#### Group O — AI-specific Emerging (2026)

| ID  | Feature                                              | Status   | Tier | Owner                             |
| --- | ---------------------------------------------------- | -------- | ---- | --------------------------------- |
| O1  | Reasoning-model token accounting                     | PARTIAL  | P0   | `@ziro-agent/core/pricing` + providers |
| O2  | Long-context auto-compress hook                      | GAP      | P1   | `@ziro-agent/core` + RFC 0011     |
| O3  | Prompt versioning                                    | GAP      | P2   | post-v1.0                         |
| O4  | Sovereign / on-prem providers (vLLM / TGI)           | PARTIAL  | P1   | `@ziro-agent/vllm`, `@ziro-agent/tgi` |
| O5  | Compliance starter pack (EU AI Act / SOC 2 / GDPR)   | GAP      | P0   | RFC 0016                          |

**Tally**: 56 features. Status: 14 `OK`, 18 `PARTIAL`, 24 `GAP`. Tier: 21 `P0`,
13 `P1`, 8 `P2`, 14 not-tiered (already `OK`).

### B. Tier definitions

- **P0 — Blocks v1.0 GA.** Either the feature ships, or v1.0 is not declared.
  21 features × ~1-3 weeks each = the next two quarters of work, distributed
  across milestones v0.3 → v0.9.
- **P1 — v1.x hardening.** Ships within 6 months after v1.0 GA. Backwards-
  compatible additions only; no breaking changes once v1.0 freezes the API.
- **P2 — Research / v2.0+.** May or may not ever ship; recorded so contributors
  stop re-proposing them quarterly. Each P2 entry should carry a "revisit by"
  date — see Open question Q5.

### C. Milestone schedule v0.3 → v1.0

The milestones below replace the v0.4 + v1.0 stubs at the bottom of the current
`ROADMAP.md`. v0.3 is rewritten to lead with **Standards & Ecosystem**
(the highest-leverage P0s). Each milestone has its own adoption matrix per the
RFC 0004 discipline.

#### v0.3 — Standards & Ecosystem (8 weeks)

**Goal**: Ziro becomes a citizen of the 2026 agent ecosystem (MCP servers,
OpenAPI tools, OTel GenAI conventions, mock provider, three-layer docs). No
new feature surface — only first-class adoption of standards already adopted
by Vercel AI SDK v6, OpenAI Agents JS, and Anthropic SDK.

| Inspired by                                  | Keep                                                                                    | Reject                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Anthropic MCP / `mcp serve` pattern          | `ziroagent mcp serve ./tools.ts` exposing `defineTool[]` + `Agent[]` over MCP transport | Bundling an MCP gateway daemon — server is a CLI subcommand, not a long-running platform              |
| Vercel AI SDK v6 / `~standard` Schema        | Tool input schema accepted from any Standard Schema validator (Zod / Valibot / ArkType / Effect / Yup) | Locking the public type surface to a single validator                                                 |
| OpenAPI 3.1 ecosystem                        | `toolsFromOpenAPI(specUrl, { auth })` in `@ziro-agent/openapi`                          | Auto-generating one tool per HTTP verb with no curation hook — emit factory + filter callbacks       |
| OpenTelemetry GenAI WG (semconv stable 2025) | Rename `ATTR.*` to `gen_ai.*` aliases, retain Ziro-specific attrs under `ziroagent.*`   | Dropping our own `ziroagent.*` namespace — multi-vendor span enrichment requires both                 |
| Vitest / Mocked LLM patterns                 | `mockModel({ responses })` + `recordModel(real)` exposed from `@ziro-agent/core/testing` | Shipping a separate `@ziro-agent/testing` package — testing utilities live with the contract under test |

P0 deliverables (IDs from §A):

- A5 OTel GenAI semconv aliases — `@ziro-agent/tracing`
- A6 MCP server — RFC 0009 → `@ziro-agent/mcp-server` + `ziroagent mcp serve`
- A7 Standard Schema interop — `@ziro-agent/tools`
- B6 Mock / record provider — `@ziro-agent/core/testing`
- H3 OpenAPI → tools — RFC 0010 → `@ziro-agent/openapi`
- M1 Three-layer docs audit — `apps/docs`

#### v0.4 — Memory & RAG (8 weeks)

**Goal**: a production agent can ingest a 10K-document corpus, retrieve with
hybrid + rerank, return cited answers, and persist working / conversation
memory across sessions.

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Mastra / Working memory scopes               | `WorkingMemory` with `scope: 'resource' \| 'thread'`, markdown-block storage        | Observational Memory — not yet design-partner-pulled, Mastra owns this design                         |
| LangChain / Document loader registry         | `loadDocument(uri)` autodetect (PDF / CSV / MD / DOCX / image OCR) + adapter pattern | Chain abstraction (`DocumentLoaders` as classes) — keep a pure function adapter                       |
| LlamaIndex / Citation-first responses        | Output type `{ text, citations: [{ chunkId, score, text }] }`                       | Citation as opt-in formatter — citations are first-class on every retrieval call                      |
| BM25 + RRF (Pinecone hybrid, Vespa)          | Hybrid as default in `@ziro-agent/memory`; semantic-only via explicit flag          | One-vector-per-doc design — chunked-then-RRF is the default                                           |
| Cohere / Voyage / BGE rerankers              | `rerank()` middleware composable in retrieval pipeline                              | Coupling reranker to a single provider — ships as `RerankerAdapter` interface                         |

P0 deliverables: E1 memory tiers, E2 citations, E3 hybrid search, E4 reranker,
E5 document ingestion. All under RFC 0011 (memory) + RFC 0012 (RAG).

#### v0.5 — Safety & Governance (6 weeks)

**Goal**: ship the structural safety primitives that turn the existing
heuristic middlewares into an auditable governance layer.

| Inspired by                                  | Keep                                                                                                  | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI Agents JS / `requiresApproval` flag   | `mutates: true` heuristic auto-sets `requiresApproval` on `defineTool`                                | Network-egress checks at tool runtime — too late; agent-level egress allowlist instead                |
| Vercel AI SDK / `generateObject` + JSON mode | `generateObject({ schema })` with 1-shot validation-failure repair                                    | Shipping our own JSON-mode shim per provider — providers own this; we wrap                            |
| Mastra / Tenant-scoped budgets               | `withBudget({ tenantId, hard: true })` + cost attribution span attribute                              | Per-tool token caps — too granular; per-agent + per-tenant only                                       |
| Adversarial eval research                    | `@ziro-agent/eval/safety` ships red-team prompt suites (jailbreak / PII / off-topic) with version pinning | Auto-running adversarial evals on every PR — opt-in via `pnpm eval --suite=safety`                    |

P0 deliverables: C1 default-deny mutating, C4 structured output, C2 tenant
budget (P1 → promoted to P0 if a design partner pulls), and C5 (P1 → kept as
P1 unless asked).

#### v0.6 — Resilience (6 weeks)

**Goal**: the SDK survives provider outages, malformed completions, flaky
tools, and process crashes — without operator intervention.

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| LiteLLM / Provider fallback chain            | `wrapModel(primary, fallback([anthropic, openai]))` with circuit breaker            | LiteLLM's per-call routing config file — keep configuration in code                                   |
| OpenAI Agents JS / `repairToolCall`          | `repairToolCall(call, error, ctx) => repairedCall \| null` hook on `agent.run`      | Auto-repair via second LLM call by default — opt-in, cost-aware                                       |
| LangSmith / Trace replay                     | `recordRun()` → JSONL trace + tool I/O; `replayRun(trace)` reuses recorded LLM responses | Vendor-locked replay format — emit OTel-compatible JSON                                               |
| Speculative execution (Cursor, Vercel)       | (deferred to P2)                                                                    | Premature optimisation — re-evaluate when 3+ design partners cite p99 latency                         |

P0 deliverables: K3 fallback chain, L1 record/replay, B6 mock provider (split
from v0.3 if v0.3 slips), Inngest+Temporal parity (G5 promoted from P1).

#### v0.7 — Multi-modal & Sandbox (8 weeks)

**Goal**: agents handle audio + file inputs and run code / browse the web in
sandboxed environments — the two most-cited "missing piece" complaints in the
2026 agent demo cycle.

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic / Google content parts    | `audio`, `file`, `image` parts on `UserMessage.content`; large content via URL handle | Base64 inlining for >1 MB payloads — file handles only                                                |
| E2B / Modal / Daytona                        | `@ziro-agent/sandbox-e2b` adapter implementing `SandboxAdapter` interface           | Bundling an in-process Node VM as the default — sandboxing requires kernel isolation                  |
| Browserbase / Stagehand / Anthropic Computer Use | `@ziro-agent/browser-playwright` adapter + `browse(url, intent)` high-level tool | Reimplementing Stagehand's NL-to-action layer — keep low-level page primitive, ship cookbook for high-level wrappers |
| ElevenLabs / Whisper / OpenAI TTS            | (P1) `speak(text, voice)` + `transcribe(audio)` model interfaces                    | Bundling TTS / STT into the chat agent loop — separate model surface                                  |

P0 deliverables: I2 audio input, I3 file parts, H4 code sandbox, H5 browser
tool. All under RFC 0013 (sandbox) + RFC 0014 (multi-modal parts).

#### v0.8 — Sovereign & Compliance (6 weeks)

**Goal**: VN/SEA banking + EU AI Act design partners can deploy air-gapped
with a documented compliance posture.

| Inspired by                                  | Keep                                                                                | Reject                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| vLLM, TGI, LM Studio                         | `@ziro-agent/vllm`, `@ziro-agent/tgi` providers                                     | Hosting a model registry — providers only, no model lifecycle                                         |
| EU AI Act + ISO/IEC 42001 templates          | `@ziro-agent/compliance` ships risk-assessment markdown + control-mapping JSON      | Compliance-as-a-cloud-service — must work fully offline                                               |
| GDPR right-to-erasure                        | `agent.deleteUserData(userId)` propagates across checkpointer + memory + traces     | Storing user-identifiable data in spans by default — span attrs use opaque IDs only                   |

P0 deliverables: O5 compliance pack (RFC 0016), O4 vLLM / TGI providers
(promoted from P1 if banking partner pulls).

#### v0.9 — Release Candidate stabilisation (4 weeks)

**Goal**: freeze API surface; publish migration guide + codemod; close every
P0 still open.

- B3 error `code` enum + `docsUrl` rollout across every error class
- B5 `@ziro-agent/codemod` package shipped with `v0-to-v1` transform set
- A3 zero-dep core audit (drop accidental deps from refactors)
- F2 loop-guard defaults documented + asserted in tests
- F3 sub-agent budget propagation hardened
- G1 idempotency-key API formalised on `defineTool`
- G2 auto-checkpoint cadence formalised
- M1 three-layer docs audit pass 2
- N1 `CONTRIBUTING-ADAPTERS.md` published
- N2 release-cadence commitment in `RELEASING.md`
- J3 `SUPPORT-MATRIX.md` published (TS / Node LTS policy)

#### v1.0 — General Availability

- API frozen; semver-strict from this point.
- Every breaking change since v0.1 mapped in `apps/docs/content/docs/migration.mdx`.
- `@ziro-agent/codemod` covers every breaking change with an executable transform.
- `BENCHMARKS.md` republished with v1.0 numbers vs. Vercel AI SDK v6, Mastra,
  OpenAI Agents JS.
- Compliance pack published.
- Ziro Cloud GA — managed durable execution + observability + eval store, free
  tier (10K agent steps/month), self-hostable parity always.

### D. Non-goals for v1.0

The following are explicitly **not** v1.0 P0s. They may be picked up after GA.

- **A8 — A2A protocol.** Spec is moving fast; ship an adapter only after a
  stable spec is published.
- **H6 — Tool capability manifest + signed marketplace.** Marketplace is a
  separate product (Ziro Cloud / Ziro Hub), not the SDK.
- **K4 — Speculative execution.** Premature; revisit if p99 latency complaints.
- **N3 — Anonymous telemetry.** Legal review + opt-in UX work; post-v1.
- **O3 — Prompt versioning UI.** Lives in the dashboard product, not the SDK.
- **E7 — Knowledge graph storage.** No design-partner pull yet.
- **I6 — Video parts.** Provider support is uneven; v2.0+.
- **L3 — Property-based test helpers.** Nice-to-have, ships when contributor proposes.

### E. RFC tracking (child RFCs spawned by this RFC)

Each child RFC is a stub at merge of RFC 0008 and is fleshed out before the
corresponding milestone starts.

| RFC  | Title                                              | Milestone | Owner package(s)                             |
| ---- | -------------------------------------------------- | --------- | -------------------------------------------- |
| 0009 | MCP server (`ziroagent mcp serve`)                 | v0.3      | `@ziro-agent/mcp-server`, `@ziro-agent/cli`  |
| 0010 | OpenAPI → tools generator                          | v0.3      | `@ziro-agent/openapi`                        |
| 0011 | Memory tiers (working / conversation / long-term)  | v0.4      | `@ziro-agent/memory` + `@ziro-agent/agent`   |
| 0012 | RAG hardening (hybrid + rerank + ingestion + cite) | v0.4      | `@ziro-agent/memory`                         |
| 0013 | Sandbox tools (code + browser)                     | v0.7      | `@ziro-agent/sandbox-e2b`, `@ziro-agent/browser-playwright` |
| 0014 | Multi-modal content parts (audio / file / video)   | v0.7      | `@ziro-agent/core` + every provider          |
| 0015 | Resilience (fallback chain + record/replay)        | v0.6      | `@ziro-agent/middleware`, `@ziro-agent/core/testing` |
| 0016 | Compliance starter pack                            | v0.8      | `@ziro-agent/compliance`                     |

Children RFCs not opened by this RFC (because the work fits into existing
packages without new public API surface):

- C1 default-deny mutating tools — small change to `defineTool`, no RFC needed
- C4 structured output — well-trodden pattern, draft alongside implementation
- A5 OTel GenAI semconv aliases — internal rename + dual-emit window
- A7 Standard Schema interop — additive type contract, draft alongside
- B5 codemod — operationally a new package but no API design risk
- O1 reasoning-model token accounting — pricing-data update + provider parsing

### F. Migration impact toward v1.0

The following changes are expected to break consumer code between today and
v1.0 GA. Each will ship behind a deprecation cycle (1 minor version of warning,
removal in next minor) and will be covered by `@ziro-agent/codemod`.

1. **Error class shape.** Every error gets `code: string` (enum) + `docsUrl:
   string`. Existing thrown classes already extend `ZiroError`; consumers
   doing `instanceof` keep working. Consumers reading `.message` to branch on
   error kind must switch to `.code`.
2. **OTel attribute names.** `ATTR.ModelInputTokens` → `gen_ai.usage.input_tokens`
   (Ziro keys retained via dual-emit for one minor; removed in next minor).
3. **Content parts.** Adding `audio` / `file` parts is additive but providers
   that previously returned plain string content may now return `Array<Part>`
   when input contains non-text parts. Providers will gate this behind a
   `version` field or per-call flag during the transition.
4. **`generateObject` signature.** New canonical form `generateObject({ schema, model, prompt })`
   may replace the current ad-hoc JSON-mode pattern; codemod covers it.
5. **`Checkpointer.list` pagination.** Unbounded `list()` will require a
   pagination cursor before v1.0 to avoid OOM on large threads.
6. **`AgentSnapshot.version` bump.** Already migrated v1 → v2 in v0.1.9; v3 is
   reserved for the audio / file content-part addition.

No package will be renamed. No public scope (`@ziro-agent/*`) will change.

## Open questions

The following decisions block individual child RFCs but not RFC 0008's merge.
Each is expected to be resolved before the corresponding child RFC lands.

1. **Q1 — SDK lean vs. full platform.** RFC 0008 assumes "lean SDK + reference
   implementations". The conversation that triggered this RFC offered three
   options (lean / full platform / hybrid) and was left unanswered. The
   consequence is concrete: should `apps/dashboard` (production-ready
   Next.js app, separate from the dev `apps/playground`) live in this monorepo
   or a sibling repo? Defer to RFC 0017 if hybrid is chosen; keep status quo
   otherwise.
2. **Q2 — Standard Schema commitment.** Hard requirement (`tool.inputSchema`
   must be Standard Schema) or soft (Zod accepted as today, Standard Schema
   accepted alongside)? Soft is backwards-compatible; hard is a v1.0 breaking
   change. Default in this RFC: soft.
3. **Q3 — Anonymous telemetry opt-in.** Post-v1 per §D, but if we want it
   shipped *with* v1.0 the legal + UX work needs to start two milestones ahead.
4. **Q4 — Marketplace coupling.** H6 is non-goal for v1.0, but should the
   tool-capability manifest schema be reserved in v1.0 (forward-compatibility)
   even if no enforcement ships? Default: yes, reserve `tool.capabilities?:
   string[]` in v1.0 so v1.x can enforce non-breakingly.
5. **Q5 — API freeze deadline.** Calendar v1.0 (e.g. Q4 2026) or feature-gated
   v1.0 (every P0 done, no calendar)? Default: feature-gated, with a quarterly
   "review and decide" cadence at every milestone close.
6. **Q6 — P2 entry expiry.** Should each P2 row carry a "revisit by" date so
   the matrix doesn't bloat across years? Default: yes; review at every
   roadmap-update RFC (so RFC 0008 sets the precedent here).

## Drawbacks

1. **Roadmap thrash.** RFC 0004 published 2026-04-20 was already a "v2".
   Publishing v3 the same day looks indecisive. Mitigation: v0.1.9 + v0.2 are
   unchanged; this RFC only extends past v0.3 and rolls in 56 newly-tracked
   features. Frame as "we shipped v0.2 in two months and need a longer arc".
2. **Tier inflation.** 21 P0s is a lot. Risk: every quarter a new feature gets
   "P0-promoted" and v1.0 slips indefinitely. Mitigation: §C bakes P0s into
   six concrete milestones with week budgets; promotion of a P1 to P0 must
   demote another P0 to P1 in the same RFC update.
3. **Child RFCs may not be written.** Eight RFC stubs is eight commitments.
   Risk: stubs sit at "draft" for months. Mitigation: each child RFC is gated
   on its milestone; stubs explicitly say "Detailed design TBD before
   milestone start".
4. **Compliance / legal scope creep.** RFC 0016 touches EU AI Act, SOC 2,
   GDPR. Non-trivial for an OSS project. Mitigation: ship templates
   (markdown + JSON), not legal advice; explicitly disclaim no-warranty.
5. **The "audit trail" framing may not match design-partner reality.** Some
   partners may want EU AI Act compliance, others may want zero-config
   simplicity. Mitigation: every governance feature is opt-in; defaults
   stay terse.

## Alternatives considered

### Alternative 1 — Stop after v0.3 and reassess

Ship the v0.3 plan, then write a fresh roadmap. Cheaper short-term.

**Rejected**: contributors and design partners need a v1.0 horizon to make
buy-vs-build decisions. A 2-quarter plan is the minimum useful planning
window for an SDK that wants to be picked up by enterprises.

### Alternative 2 — Skip the gap matrix; only publish milestones

Faster to write. Loses the "every feature has a status" transparency that
makes contribution tractable.

**Rejected**: RFC 0008's value is the matrix discipline, not the milestone
list. Milestones without an underlying feature inventory drift.

### Alternative 3 — Fewer child RFCs (e.g. one omnibus "v0.4 features")

Easier governance overhead.

**Rejected**: omnibus RFCs have historically been the failure mode of
agent-SDK projects (they ship as one PR, regress on review, get partially
reverted). One feature per RFC is the lesson learned from RFCs 0001-0007.

### Alternative 4 — Promote A2A protocol (A8) and prompt versioning (O3) to P0

Both are emerging trends with real demand.

**Considered seriously.** A2A spec is not yet stable enough to commit to a
v1.0-frozen API. Prompt versioning is a dashboard-product feature, not an SDK
primitive. Both stay P2 in this RFC; if either spec stabilises before v0.6,
RFC 0008 should be amended (not silently changed).

### Alternative 5 — Drop multi-modal entirely from v1.0

Half the I-group is `GAP`. Audio + file parts add provider-implementation
work to four packages.

**Rejected**: 2026 design partners increasingly send PDFs and audio; shipping
v1.0 with image-only content parts would freeze the API at a state that needs
breaking change in v1.1. Better to ship the full content-parts shape now.

## Adoption strategy

This is documentation-only; no code consumers are affected.

### Process

1. RFC opens (this PR).
2. 7-day comment window per `GOVERNANCE.md` informal default for governance
   changes.
3. BDFL approval per `GOVERNANCE.md` §Decision-making ("Governance change →
   RFC + BDFL approval").
4. Merge → write the new `ROADMAP.md` content + 8 RFC stubs in the same PR.
5. RFC status flipped to **accepted (2026-MM-DD)**.
6. Follow-up: every child RFC (0009–0016) opens as a draft within two weeks
   of its milestone start (per the §C schedule).

### Communication

On merge:

- 1 short blog post on `apps/docs/content/blog/` titled "Roadmap v3: the path
  to v1.0".
- 1 doc-only changeset referencing this RFC; no version bumps.
- Pin the RFC index entry on the docs site front page until v1.0 GA.
- Update the GitHub Projects board to reflect the new tier matrix (P0 / P1 /
  P2 columns instead of milestone-only columns).

### Reverting

If a milestone slips by >50%, the BDFL re-opens RFC 0008 with an amendment.
Tier promotions / demotions go via RFC amendment, not silent ROADMAP edits.
This keeps the gap matrix auditable.

## Unresolved questions

See §Open questions above. The six items there are RFC-level; smaller
implementation questions belong in the child RFCs.

## Prior art (this RFC's sources)

- Vercel AI SDK v6 — `wrapLanguageModel`, `prepareStep`, Standard Schema, edge
  runtime DX.
- OpenAI Agents JS — `handoffs`, `repairToolCall`, MCP server, structured
  outputs.
- LangGraph JS — `Checkpointer`, `interrupt()`, replay-from-trace.
- Mastra — Working memory scopes, `MemoryProcessor`, AG-UI integration.
- Anthropic SDK + MCP spec — content parts with audio, MCP server lifecycle.
- LiteLLM — provider fallback chain pattern.
- LangSmith — trace replay format.
- Inngest Agent Kit — durable adapter shape (already absorbed in v0.2).
- Letta — what *not* to do (self-editing memory tools).
- Cohere / Voyage / BGE — reranker as middleware.
- E2B / Modal / Browserbase — sandbox adapter pattern.
- OpenTelemetry GenAI WG — semantic convention namespace.
- EU AI Act + ISO/IEC 42001 — compliance template scope.
- Pinecone / Vespa hybrid retrieval — RRF as default fusion.
