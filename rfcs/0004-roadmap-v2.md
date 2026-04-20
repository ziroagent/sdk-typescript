# RFC 0004: Roadmap v2 — competitive absorption with anti-roadmap discipline

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **draft**
- Affected packages: meta — modifies `ROADMAP.md`, no source code change

## Summary

Restructure `ROADMAP.md` v0.2 → v1.0 to absorb the strongest patterns from the
12 dominant TypeScript / Python agent SDKs (Vercel AI SDK v6, Mastra, LangGraph
JS, OpenAI Agents JS, Strands Agents, Inngest Agent Kit, Convex Durable Agents,
PydanticAI, Letta, Genkit, AutoGen, LiteLLM) while explicitly **rejecting**
patterns that violate the production-safety thesis or the OSS-first promise.

Three structural changes:

1. **Adoption matrix per milestone.** Every milestone now declares — in a 3-column
   table — which competitor pattern it inspires from, what we keep, and what we
   reject. This makes "why ship this and not that" auditable.
2. **Reorder v0.2 to lead with `LanguageModelMiddleware` + `Checkpointer`.**
   These are 2-week shippable primitives that unlock the *gateway*, *guardrails*,
   *cache*, and *durable-without-Temporal* stories simultaneously, instead of
   waiting 6-8 weeks on three durable-execution adapters.
3. **Insert v0.1.9 housekeeping milestone** before v0.2 to close the
   docs/README/Sovereign-pillar gaps surfaced during competitive review,
   restoring trust before adding new feature surface area.

This RFC is a **governance change** under `GOVERNANCE.md` §Decision-making
("Governance change → RFC + BDFL approval (pre-v1.0)"). It introduces no new
runtime API; merging it only updates `ROADMAP.md` content + adds entries to the
existing anti-roadmap.

## Motivation

The current `ROADMAP.md` (committed 2026-04-20) was authored before any
competitive review. Reading the 12-SDK research summarised in `STRATEGY.md`
§4 + the deep dive performed during RFC 0001-0003 implementation, three issues
emerged:

### Issue 1 — v0.2 task ordering is high-risk

The current v0.2 leads with three durable-execution adapters (Temporal,
Inngest, Restate). Each adapter realistically needs ~2-3 weeks of integration
testing against a real server (we don't ship mocks per `STRATEGY.md` §4.4).
That's 6-9 weeks before users see *any* v0.2 value beyond patches.

Meanwhile a `LanguageModelMiddleware` interface — the abstraction Vercel AI SDK
v3-spec ships and that we'd otherwise need to reinvent inside `@ziro-agent/gateway`
— is a 1-2 week change that *immediately* unlocks: PII redaction, prompt-injection
guards, retry/backoff, semantic cache, cost-tracking middleware. All four were
listed as separate v0.2 tasks; one primitive subsumes them.

### Issue 2 — durable execution is conflated with workflow engines

LangGraph's checkpointer + thread-id + `interrupt()` pattern, Strands Agents'
`SessionManager` with three save strategies, and Mastra's resumable streams all
prove that **durable-without-Temporal** is the more common need. Most production
agents don't run for hours — they run for *seconds-to-minutes* and need to
survive a process restart, not a multi-day wait.

We already have `AgentSnapshot` + `agent.resume()` from RFC 0002. Adding a
`Checkpointer` interface (`get`/`put`/`list`/`delete`) + 3 storage adapters
(memory, postgres, redis) gives 80% of the durable story in 2 weeks. Temporal
+ Inngest + Restate then become the "long-running / cross-day" adapters,
not the *only* path to durability.

### Issue 3 — the Sovereign pillar is empty in shipped code

`README.md`, `POSITIONING.md`, and `STRATEGY.md` all mark Sovereign Mode as
pillar #4. The current v0.1 release ships **zero providers** in that pillar —
no `@ziro-agent/ollama`, no vLLM, no LM Studio. Pillar credibility is broken
the moment a Vietnamese-fintech design partner runs `pnpm add @ziro-agent/ollama`
and gets 404. v0.3 is too late.

### Issue 4 — competitive absorption isn't transparent

Contributors (and increasingly LLM-driven contributors) need to understand
*why* we ship feature X but reject feature Y. Today the anti-roadmap is 9
bullets without sources. After absorbing 12 SDKs we have ~30 features to
explicitly reject, each with a real-world example. Documenting them prevents
the same PR from being re-proposed every quarter.

## Detailed design

This RFC modifies one file: `ROADMAP.md`. The replacement structure is below;
existing v0.1 content is preserved verbatim.

### Structural changes

#### A. Adoption matrix template

Every milestone (v0.2 onward) gains a `### Adoption matrix` subsection using
the schema:

```md
| Inspired by                | Keep                                      | Reject                                    |
| -------------------------- | ----------------------------------------- | ----------------------------------------- |
| `competitor / pattern`     | one-line specific feature we adopt        | one-line specific anti-feature, with why  |
```

Three rules for every entry:

- **Inspired-by** must name the competitor product *and* a specific concept
  (e.g. "LangGraph / `interrupt()`" not "LangGraph"). One row per competitor;
  if a competitor inspires nothing, omit the row.
- **Keep** must be a primitive, not a feature. ("`Checkpointer` interface w/
  4 methods" not "support saving state".)
- **Reject** must cite the failure mode the rejection prevents. ("Cloud-only
  durability — violates §Strategy 4.4 OSS-first" not "we don't like LangChain").

#### B. Insert v0.1.9 housekeeping milestone

Before v0.2:

```md
## v0.1.9 — Trust recovery (2 weeks, before v0.2 feature work)

**Goal**: close the gap between what `README.md` promises and what npm
publishes. No new primitives.

### Documentation
- [ ] `apps/docs/content/docs/budget-guard.mdx` (RFC 0001 — pillar #1, currently undocumented on the docs site)
- [ ] `apps/docs/content/docs/hitl.mdx` (RFC 0002)
- [ ] `apps/docs/content/docs/evals.mdx` (RFC 0003)
- [ ] `apps/docs/content/docs/errors.mdx` — every Ziro error with brand check & recovery pattern
- [ ] `apps/docs/content/docs/comparison.mdx` — promote `POSITIONING.md` into site
- [ ] `apps/docs/content/docs/cookbooks/*.mdx` — five recipes: try/catch budget · persist snapshot to Postgres · expose tools as MCP · fallback model on `BudgetExceededError` · RAG with budget cap
- [ ] `apps/docs/content/docs/migration.mdx` — v0.x churn policy explicit
- [ ] Auto-build TypeDoc in CI; commit to `apps/docs/public/api/` so `/api/*` pages stop being 404s
- [ ] Sync `apps/docs/content/docs/getting-started.mdx` CLI invocation with `README.md` (currently mismatched: `pnpm dlx @ziro-agent/cli init` vs `npm create ziro@latest`)

### README accuracy
- [ ] Mark every package row in `README.md` "Packages" table with `shipped (v0.1.x)` or `planned (v0.x)` — currently 17 packages listed, 10 actually published
- [ ] Same for the `examples/` table

### Snapshot completeness (RFC 0002 amend)
- [ ] Add `parsedArgs` to `AgentSnapshot.resolvedSiblings[]` so `agent.resume()` doesn't lose tool-call argument fidelity for already-executed siblings (currently `args: undefined` in `seedFromSnapshot`)
- [ ] Bump `AgentSnapshot.version` to `2`; ship `migrateSnapshot(v1 → v2)`

### Sovereign pillar credibility
- [ ] **`@ziro-agent/ollama` v0.1.0** — the Sovereign pillar cannot remain empty; this is a 1-week ship and unblocks the VN/SEA wedge

### Pricing data hygiene
- [ ] Add `unverified: true` flag to any `ModelPricing` entry whose `validFrom` cannot be cross-referenced against a live provider page (today: `gpt-5.4*`, `claude-opus-4-7`, `claude-haiku-4-5` etc. — the speculative 2026 IDs)
- [ ] `getPricing()` returns `undefined` for `unverified: true` unless `{ allowUnverified: true }` is passed; pre-flight enforcement falls back to chars/4 heuristic, same as for unknown models
```

This is the *only* milestone allowed to ship without absorbing competitor
features — its goal is structural debt, not new surface area.

#### C. Rewrite v0.2 — Track-based with adoption matrices

```md
## v0.2 — Production hardening (8-10 weeks)

**Goal**: ship the four "blow up in production" primitives that unblock paying
design-partner upgrades — middleware composition, graceful durability,
provider depth, and replayable evals.

### Adoption matrix

| Inspired by                                | Keep                                                                                                          | Reject                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Vercel AI SDK v3-spec / `wrapLanguageModel`| `LanguageModelMiddleware` interface w/ `transformParams` + `wrapGenerate` + `wrapStream`                      | Bundling middleware as separate provider packages — synthetic `@ai-sdk/provider-utils-v5` aliases break pnpm/Vercel deploys (Mastra issue #15248) |
| LangGraph JS / `Checkpointer`              | 4-method interface (`get` / `put` / `list` / `delete`) + thread_id + per-thread row-locked checkpoints        | `MemorySaver`-only OSS path with PostgresSaver locked to LangGraph Cloud paid tier              |
| Strands Agents / `SessionManager`          | 3 save strategies (`invocation` / `message` / `trigger`) + UUID v7 immutable snapshot ids                     | AWS Bedrock as 1st-class default; we stay provider-agnostic                                     |
| Mastra / Resumable streams                 | Cached `streamText` events with sequential index, `streamText({ resumeKey })` + adapter Redis                 | `createDurableAgent` / `createEventedAgent` / `createInngestAgent` 3-factory split — too opinionated |
| Inngest / TS-first DX                      | `@ziro-agent/inngest` durable adapter shipped first (Inngest is TS-native; Temporal needs more boilerplate)    | Coupling Inngest backend into core; adapter only                                               |
| OpenAI Agents JS / `experimental_repairToolCall` | `repairToolCall(call, error, ctx) => repairedCall \| null` hook on `agent.run` for malformed JSON args  | Default-on tracing exporter to a single hosted backend (`platform.openai.com/traces`)          |
| Vercel AI SDK / `prepareStep`              | `prepareStep({ stepIndex, messages })` to swap model / inject system / restrict `activeTools` per step        | `experimental_*` proliferation as a versioning escape hatch                                     |

### Track 1 — Middleware layer (week 1-2)

- [ ] `LanguageModelMiddleware` interface + `wrapModel(model, middleware[])` in `@ziro-agent/core`
- [ ] **`@ziro-agent/middleware`** new package: `retry()` (exponential backoff, retryable-status-aware via `APICallError.isRetryable`), `cache()` (in-memory LRU + pluggable adapter), `redactPII()` (Microsoft Presidio adapter), `blockPromptInjection()` (Lakera + heuristic)
- [ ] Tracing instrumentation reuses existing `instrumentModel()` — middleware spans nested under model spans

### Track 2 — Checkpointer + resumable streams (week 3-4)

- [ ] `Checkpointer` interface in `@ziro-agent/agent`
- [ ] `@ziro-agent/checkpoint-memory`, `@ziro-agent/checkpoint-postgres`, `@ziro-agent/checkpoint-redis`
- [ ] `agent.resumeFromCheckpoint(threadId)` / `agent.listCheckpoints(threadId)`
- [ ] `streamText({ resumeKey, resumeFromIndex })` with cached event log
- [ ] **Renames "durable" mental model**: durable is the *default* (any checkpointer), Temporal/Inngest are the long-running adapters

### Track 3 — Provider depth (week 5-6)

- [ ] `@ziro-agent/google` (Gemini)
- [ ] `@ziro-agent/groq` (fastest inference benchmark)
- [ ] Cache-control parameters surfaced on `@ziro-agent/anthropic` (`cache_control` blocks — currently unmapped, contradicts README pillar)
- [ ] `@ziro-agent/openai` prompt-cache control parity

### Track 4 — Durable adapters (week 7-9)

- [ ] **`@ziro-agent/inngest` first** — TS-first DX, ships in ~1 week
- [ ] `@ziro-agent/temporal` — uses the `@temporalio/ai-sdk` integration as reference but does *not* depend on Vercel AI SDK
- [ ] (Restate adapter deferred to v0.3 — no design-partner demand yet)
- [ ] `examples/durable-support-agent` end-to-end with Inngest

### Track 5 — Evals polish (week parallel)

- [ ] **Replay-from-trace** (deferred from RFC 0003 §Q4) — load OTel `ziro.agent.run` span → reconstruct `EvalCase` → run against new code
- [ ] JSON / YAML datasets accepted by `ziroagent eval` (currently TS-only)
- [ ] Online sampling middleware: `samplingEval({ rate: 0.05 })` writes 5% of production traces into eval store
```

#### D. Rewrite v0.3 — fold "Multi-agent" up

```md
## v0.3 — Sovereign + Multi-agent + Frontend (10-12 weeks)

**Goal**: VN/SEA banking design partners go to production. Multi-agent
coordination is shipped as the smallest possible primitive (handoffs +
deterministic router), not a graph framework.

### Adoption matrix

| Inspired by                              | Keep                                                                                              | Reject                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI Agents JS / `handoffs[]`          | `handoffs: Agent[]` field on `CreateAgentOptions` — handoffs auto-expose as tools to the LLM, with `inputFilter` to control message history pass-through | Handoff *graph* visualisation as 1st-class — premature complexity                                     |
| Inngest Agent Kit / state-based router   | `router: (ctx) => Agent \| Agent[] \| undefined` — function-form deterministic only               | LLM-as-router (`createRoutingAgent`) — extra LLM call per step, opaque cost behaviour                 |
| Mastra / Working memory persistence scopes | `WorkingMemory` with `scope: 'resource' \| 'thread'`, markdown-block storage, libSQL+Postgres adapters | Observational Memory full implementation — defer until 1+ design partner asks; Mastra owns this design space |
| Letta / Tiered memory                    | (nothing taken into core)                                                                          | Self-editing memory tools (`core_memory_append`) — security nightmare, surface area too large         |
| AG-UI / 17 standard events               | `@ziro-agent/agui` event emitter, `@ziro-agent/react` with `<Chat>` / `<TraceTimeline>` / `<ToolApproval>` | Custom non-AG-UI event protocol — fragmenting is the worst outcome                                    |
| EU AI Act / hash-chained audit log       | `@ziro-agent/audit` package emitting JSONL with `prevHash` + `eventHash` per record               | Compliance-as-a-cloud-service — must work air-gapped                                                  |

### Track 1 — Sovereign mode

- [ ] `@ziro-agent/vllm`
- [ ] `@ziro-agent/lmstudio`
- [ ] Vietnamese tokenizer / model presets (PhoGPT, VinAI, Viettel AI, FPT.AI)
- [ ] Air-gapped install bundle (single tarball, zero network calls)
- [ ] EU AI Act audit log hash-chained format
- [ ] `@ziro-agent/nestjs` integration

### Track 2 — Multi-agent (handoffs + router only)

- [ ] `handoffs: Agent[]` on `CreateAgentOptions`
- [ ] `inputFilter: (messages) => messages` per handoff
- [ ] `router?: AgentRouter` — function-form deterministic state-based routing only
- [ ] `examples/multi-agent-handoff` (replaces over-engineered `examples/multi-agent-workflow`)
- [ ] (Reject: full graph engine like LangGraph — `@ziro-agent/workflow` already covers the small graph case)

### Track 3 — Frontend layer

- [ ] `@ziro-agent/agui` — AG-UI 17-event protocol emitter
- [ ] `@ziro-agent/react` — `<Chat>`, `<TraceTimeline>`, `<ToolApproval>`, hooks via SSE
- [ ] Resumable client (uses `streamText({ resumeKey })` from v0.2)

### Track 4 — Memory polish

- [ ] `WorkingMemory` with `scope: 'resource' | 'thread'`
- [ ] `MemoryProcessor` middleware pattern (Mastra-style: trim / summarise / inject)
- [ ] Vector store adapters: Qdrant, Pinecone, Weaviate, Chroma
```

#### E. v0.4 + v1.0 (lighter touch)

v0.4 keeps the original ROADMAP content but adds:

- A2A protocol adoption (when standardised — was already in original; now explicit on adoption matrix)
- Native Rust tokenizer via `napi-rs` (performance — bench-driven)
- Optional `@ziro-agent/effect` adapter for Effect-TS users (do **not** make Effect a core dep)

v1.0 adds:

- Compatibility commitment table mapping every v0.x → v1.0 deprecation path
- Codemod published alongside breaking changes (Vercel AI SDK v4→v5 lesson:
  shipping migration *after* the release loses goodwill)

#### F. Replace `## Anti-roadmap`

The current 9-bullet anti-roadmap is preserved and extended with the new
rejections sourced from this RFC's adoption matrices:

```md
## Anti-roadmap (things we will NOT build)

To avoid the LangChain trap of feature-creep, and informed by RFC 0004's
12-SDK competitive review (2026-04-20), we explicitly say no to:

### Original (v0.1 vintage)
- ❌ Our own LLM provider or fine-tuning service.
- ❌ A "chain" abstraction (`LCEL`-style) — `defineTool` + `agent.run` is the only composition primitive.
- ❌ Notebook-style prompt builders.
- ❌ A no-code visual agent builder (we focus on code-first DX).
- ❌ Re-implementing Temporal/Inngest/Langfuse — we adapt them.
- ❌ Closing the OSS core. Apache-2.0 forever.

### Added by RFC 0004 (with source)
- ❌ **Visual no-code agent builder** — Mastra Playground exists; outside our ICP. (Source: Mastra)
- ❌ **Effect-TS as a core runtime dep** — optional adapter only; raises learning curve. (Source: Reactive Agents)
- ❌ **Standalone gateway daemon** — Kong / LiteLLM territory; we ship middleware library only. (Source: LiteLLM)
- ❌ **Letta-style tiered memory full** — Core/Archival/Recall too heavy for 90% use cases; ship working memory + vector store. (Source: Letta)
- ❌ **LLM-based routing agent** — Inngest's `createRoutingAgent` adds opaque LLM call per step; deterministic function router only. (Source: Inngest Agent Kit)
- ❌ **Cross-language interop (.NET / Python bridge)** — TypeScript-native is the value prop. (Source: AutoGen v0.4)
- ❌ **Self-editing memory tools** (`core_memory_append`, `core_memory_replace`) — security nightmare; agents should not mutate their own system prompt. (Source: Letta)
- ❌ **Synthetic npm aliases** (`@ai-sdk/provider-utils-v5` style) — breaks pnpm strict symlinks + Vercel deploys. (Source: Mastra issue #15248)
- ❌ **Cloud-only durability** — Checkpointer + adapters always self-hostable. (Source: LangGraph Platform)
- ❌ **Default-on tracing to a single hosted backend** — OTel-first, Langfuse / Braintrust / Honeycomb / Datadog all equal. (Source: OpenAI Agents JS)
- ❌ **`experimental_*` API prefix as a long-term versioning escape hatch** — promote or remove within 2 minor versions. (Source: Vercel AI SDK)
- ❌ **Recursive type-introspection on every message payload** — bench every release; reject any code path that costs >1% CPU on 100KB payloads. (Source: anthropic-sdk-python issue #1195)
- ❌ **Opinionated full-stack** — every Ziro primitive is replaceable / unbundleable. No `withMastra(everything)` god-object. (Source: Mastra)
- ❌ **Coupling AI SDK V-major version to consumer types** — never expose a 3rd-party LanguageModelV3 type publicly; keep our `LanguageModel` stable. (Source: Mastra issue #14351)
- ❌ **Empty pillars in marketing** — every pillar in `README.md` must map to a *shipped* package by v0.2. (Source: own retrospective)
```

### Non-goals of this RFC

- This RFC does **not** introduce new public APIs. Every primitive named
  (`LanguageModelMiddleware`, `Checkpointer`, `handoffs`, etc.) requires its
  own RFC before implementation. v0.2 will likely have RFCs 0005-0008.
- This RFC does **not** change `STRATEGY.md` or `POSITIONING.md`. Both
  remain authoritative on *what* and *for whom*; this RFC only updates
  *when* and *in what order*.
- This RFC does **not** retroactively re-version published packages.

## Drawbacks

1. **Roadmap thrash.** We just published a roadmap two days ago (2026-04-20).
   Re-publishing on 2026-04-22 risks signalling "they don't know what they're
   doing." Mitigation: the v0.1 section is unchanged; v0.2+ explicitly cites
   RFC 0004 as the source of the reorder, framing it as discipline (research-
   informed iteration) not chaos.
2. **More writing, less coding.** Adoption matrices add overhead per milestone.
   Mitigation: the matrix is short (5-7 rows), and we already do this work
   informally during PR review — formalising it costs ~15 min per milestone.
3. **v0.1.9 delays v0.2 feature work by 2 weeks.** Mitigation: trust recovery
   compounds. Shipping v0.2 features on top of a broken README produces lower
   adoption than shipping them on a fixed README.
4. **Some absorbed patterns may not survive contact with users.** Mitigation:
   each absorbed primitive ships behind its own RFC, and the matrix's
   "Reject" column is revisable when a design partner *does* ask for the
   rejected feature with a real use case.

## Alternatives

### Alternative 1 — Keep the current ROADMAP, add a CHANGES.md

Append a "ROADMAP changes" log without touching the structure. Cheaper but
loses the adoption-matrix transparency that future contributors need.

**Rejected**: the value of this RFC is the matrix discipline, not just the
reorder. Without matrices, the same feature requests recur quarterly.

### Alternative 2 — Skip v0.1.9, fold housekeeping into v0.2 patches

Ship docs as we go through v0.2. Faster on paper.

**Rejected**: docs that lag implementation by N weeks erode the "production-
safety" trust signal — exactly the trust we sell. v0.1.9 is cheap insurance.

### Alternative 3 — Ship `LanguageModelMiddleware` *without* a checkpointer

Middleware first, defer durable to v0.3.

**Rejected**: durable + middleware together = the design-partner unlock.
Either alone is half a story. The 4 weeks of Tracks 1+2 is the smallest
package that produces a "we'd pay for this" reaction in pilot calls.

### Alternative 4 — Absorb less, focus harder

Skip handoffs, skip working memory, skip AG-UI; do only durable + middleware
+ provider depth.

**Considered seriously.** The risk: v0.3 design-partner conversations turn
on multi-agent demos (banking workflows) and frontend integration (the eng
lead always asks "how do I plug this into our React dashboard?"). Without
handoffs and AG-UI, we lose those conversations. We're keeping them, but
**at the smallest primitive size** (handoffs without graph viz, AG-UI
without inventing our own protocol).

## Adoption strategy

This is documentation-only; no code consumers are affected.

### Process

1. RFC opens (this PR).
2. 7-day comment window (per `GOVERNANCE.md` informal default for governance changes).
3. BDFL approval per `GOVERNANCE.md` §Decision-making ("Governance change → RFC + BDFL approval").
4. Merge → write the new `ROADMAP.md` content in the same PR or a follow-up.
5. RFC status flipped to **accepted (2026-MM-DD)**.
6. Original `ROADMAP.md` is preserved in git history; the v0.1.x note remains so existing public links stay valid.

### Communication

On merge, post:

- 1 short blog post on `apps/docs` "Roadmap v2: what we learned from 12 SDKs".
- 1 changeset (`patch` on every package) referencing this RFC so the next
  release notes mention it.
- Update the [GitHub Projects board](https://github.com/ziroagent/sdk-typescript/projects)
  to mirror the new track structure.

## Unresolved questions

1. **Q1 — should `WorkingMemory` and `Checkpointer` share a backend?**
   Both want Postgres. Ship as one package (`@ziro-agent/state`) or two
   (`@ziro-agent/checkpoint` + `@ziro-agent/memory`)? Defer to the
   `WorkingMemory` RFC.

2. **Q2 — Inngest before Temporal or in parallel?**
   Inngest is faster to ship; Temporal has bigger enterprise pull. Current
   draft says Inngest first, Temporal week 8-9. Open to flipping if the
   first 3 design-partner calls are Temporal-shop heavy.

3. **Q3 — should `repairToolCall` ship in v0.1.9 or v0.2?**
   It's a 1-day change with high pain-relief value (every Anthropic agent
   eventually trips over malformed JSON). Currently in v0.2 Track 4
   adoption matrix, but could move to v0.1.9 if we want a quick win.

4. **Q4 — pricing-data drift response: warn-only forever, or eventually fail CI?**
   Out of scope for this RFC but should be revisited when we have ≥3 months
   of drift signal data. Track as a v0.2 follow-up.

5. **Q5 — anti-roadmap entry expiry.**
   Some rejections are time-bound ("multi-agent visual builder — not now").
   Should each anti-roadmap entry carry a "revisit by" date, or stay until
   explicitly removed by RFC? Current draft: stay until RFC removes them.
