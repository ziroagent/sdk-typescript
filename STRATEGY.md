# Strategy — Direction A Deep Dive

> Internal-but-public operating playbook for Ziro AI SDK. Written so contributors, design partners, and future hires understand exactly *what we're building, for whom, why, and how we win*.

This document complements [`POSITIONING.md`](POSITIONING.md) (what Ziro is) and [`ROADMAP.md`](ROADMAP.md) (what we ship when). This file answers: **how do we actually win the production-safe agent market?**

Reviewed every quarter. Last review: 2026-04-19.

---

## 1. The thesis in one paragraph

By the end of 2026, every serious AI agent in production will need four things the current TypeScript SDK ecosystem doesn't provide as primitives: **(1) durable execution that survives crashes without re-paying token costs, (2) per-call/per-session budget guards that throw before overspend, (3) replayable traces that double as eval cases, and (4) tamper-evident audit logs for compliance.** Vercel AI SDK is too thin (app SDK with agent support, not an agent runtime). Mastra is too opinionated (you can't unbundle their stack). LangGraph TS is a Python port with limited durability outside paid LangGraph Cloud. Ziro fills this exact gap, OSS-first, with optional managed cloud.

---

## 2. Ideal Customer Profile (ICP)

We will say no to every customer outside this profile until v0.5+.

### Primary ICP: "The mid-market AI engineer who got paged"

| Attribute | Value |
| --- | --- |
| Company size | 50–5,000 employees, $5M–$500M revenue |
| Stage | Series B–D startups, or mid-market with 1+ AI agent in production |
| Tech stack | TypeScript-first, Node/Bun runtime, Postgres or similar |
| Has at least 1 of | Customer-support agent, internal-ops agent, code-review agent, financial-reconciliation agent, data-pipeline agent |
| Pain trigger (≥1) | (a) Got a surprise $1K+ AI bill in the last 90 days, (b) had a HITL workflow lose state on deploy, (c) can't reproduce a production agent bug locally, (d) compliance team is asking about audit logs |
| Buying authority | Tech lead / staff eng / VPE — bottoms-up adoption, not procurement-driven |

### Secondary ICP (wedge, v0.3+): "The regulated VN/SEA enterprise"

| Attribute | Value |
| --- | --- |
| Industry | Banking, fintech, e-commerce, telco in VN/SEA |
| Compliance trigger | Decree 13/2023 (VN data residency), MAS TRM (SG), upcoming PH/ID AI rules |
| Tech stack | NestJS / Spring on-prem, ❌ no Vercel hosting allowed |
| Why us | Sovereign mode (Ollama/vLLM) + Vietnamese-first docs + audit log + on-prem playground |
| Buying authority | CTO / Head of AI — top-down, RFP-driven |

### Anti-ICP (we say no to)

- Solo developers building a chatbot side project (use Vercel AI SDK).
- Python-first ML teams (use PydanticAI / LangGraph).
- Companies needing 30+ provider support (we'll have 5-6 deeply integrated).
- No-code / citizen-developer audiences.
- Anyone who needs us to fine-tune models or host inference.

---

## 3. The problem we're paid to solve

Five concrete production failures, each mapping to a Ziro primitive:

| Production failure | Documented impact | Ziro primitive |
| --- | --- | --- |
| Agent enters retry loop, burns tokens | $1.40 → $50K incidents documented (2026 incident report) | `BudgetGuard` (RFC 0001) |
| Crash mid-tool-call → re-runs from start, double-charged | 3-15% tool-call failure rate even in well-engineered systems | `DurableRuntime` (Temporal/Inngest/Restate adapters) |
| Production bug not reproducible locally | Mean time to resolution >40 hours for non-deterministic agents | `ReplayableTrace` — capture trace, replay locally |
| HITL approval workflow loses state on deploy | Customer abandonment + manual cleanup | `requiresApproval` + suspend/resume primitives |
| Compliance can't prove what agent did | Audit findings + EU AI Act fines (Aug 2026) | Hash-chained audit log, OTel-exportable |

If we ship these five primitives well, we have a product. Everything else is feature-creep.

---

## 4. Technical moat — what makes us hard to copy

### 4.1 The "runtime adapter" abstraction

Most SDKs hard-code their durability (LangGraph Cloud, Mastra in-process). We define an `AgentRuntime` interface that **any** durable execution engine can implement:

```ts
interface AgentRuntime {
  startRun(spec: AgentSpec): Promise<RunHandle>;
  resumeRun(runId: string): Promise<RunHandle>;
  signalRun(runId: string, signal: string, data: unknown): Promise<void>;
  // ... checkpoint, replay, signal hooks
}
```

We ship adapters for Temporal, Inngest, Restate, and a default in-memory runtime for dev. **Customers are never locked into our durability choice.** This is the moat — incumbents can't add this without breaking existing users.

### 4.2 Budget as a first-class primitive, not gateway middleware

LiteLLM and Kong put budgets at the gateway layer (after the SDK call). We put it **at the SDK call site** so it can throw synchronously *before* the request goes out. This unlocks:

- Try/catch around budget exceptions in user code.
- Per-tool-call budget instead of per-request.
- Budget composes through agent loops (sum of all steps).

### 4.3 Trace replay as the same artifact as evals

Most stacks have one format for traces (Langfuse) and another for evals (Promptfoo). We make them the same: a trace IS a replayable eval case. This means:

- Production failure → one click → eval case in CI.
- Refactor a tool → replay 1000 historical traces to detect regressions.
- No "synthetic eval drift" — your evals are real production data.

### 4.4 OSS-first, but optional managed cloud

Apache-2.0 forever. The SDK is fully self-hostable with no feature gating. **Ziro Cloud is convenience, not lock-in.** This is structurally different from LangGraph (Cloud-gated durability) and gives us trust capital that paid-cloud-first competitors can't match.

---

## 5. Go-to-market motion (12-month plan)

We are **bottoms-up, developer-first**. No SDR-led enterprise sales until v1.0.

### Phase 1 — Launch (months 0–3, v0.1)

**Goal**: 1,000 GitHub stars, 50 weekly downloads, 3 design partners.

**Tactics**:
- v0.1.0 npm release with provenance + GitHub Release.
- **Launch posts**: HackerNews ("Show HN: Ziro — TypeScript agent SDK with built-in durability"), r/LocalLLaMA, r/typescript, X (with code GIFs).
- **MCP-first distribution**: Ship `@ziro-ai/mcp` so Claude Desktop / Cursor users discover Ziro as an MCP server, not as a library.
- **Content**: 4 launch blog posts:
  1. *"Why 88% of AI agents fail in production (with public incident data)"*
  2. *"Building an agent that survives 3 crashes mid-tool-call"*
  3. *"Cost guardrails: a $0.80 → $50K story and how to prevent it"*
  4. *"Replay-driven evals: turn production failures into regression tests"*
- **Design partners**: identify 3 (1 YC startup, 1 VN fintech, 1 internal-ops mid-market). Free Pro license + weekly office hours in exchange for case study rights.

### Phase 2 — Production hardening (months 3–6, v0.2)

**Goal**: 5,000 stars, 500 weekly downloads, 10 design partners, $0 ARR (deliberately).

**Tactics**:
- Ship Temporal/Inngest/Restate adapters → blog post per adapter, co-marketing with each platform.
- Ship `@ziro-ai/eval` → "Ziro vs Promptfoo" comparison post (honest, see `BENCHMARKS.md`).
- **Weekly trace teardown video series** (10-min YouTube): take a real (anonymized) production trace, walk through what went wrong, show how Ziro would have caught it.
- Conference talks: NodeConf EU, AI Engineer Summit, JSConf VN.
- Apply to YC / a16z OSS / open-source grant programs.

### Phase 3 — Sovereign + monetization beta (months 6–9, v0.3)

**Goal**: 10,000 stars, 5,000 weekly downloads, 1 paying pilot ($5–10K ARR).

**Tactics**:
- Ship sovereign mode + VN presets → target 2-3 VN bank pilots via direct outreach.
- **Ziro Cloud closed beta** for existing design partners.
- Compliance pack (EU AI Act audit format) → blog post + LinkedIn outreach to EU CTOs.
- Hire DevRel #1.

### Phase 4 — Cloud GA + first ARR (months 9–12, v1.0)

**Goal**: 25,000 stars, 50,000 weekly downloads, $250–500K ARR.

**Tactics**:
- Ziro Cloud GA with public pricing.
- API frozen, semver-strict.
- Case studies from 3 design partners published.
- First 1-2 enterprise contracts ($50–100K/yr each).

---

## 6. Pricing model (Ziro Cloud, v1.0)

The OSS SDK is always free. Ziro Cloud is the managed convenience layer.

| Tier | Price | Agent steps/mo | Trace retention | Eval suite | Audit log export | SSO/SCIM | Support |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Free** | $0 | 10,000 | 7 days | ❌ | ❌ | ❌ | Community |
| **Pro** | $99/mo | 100,000 | 30 days | ✅ | CSV/JSON | ❌ | Email, 48h |
| **Team** | $499/mo | 1,000,000 | 90 days | ✅ | + Webhook | SAML | Slack, 24h |
| **Enterprise** | Custom (typ. $50K+/yr) | Unlimited | 365 days | ✅ | + Streaming | + SCIM | Dedicated, SLA, on-prem option |

**Why this works**:
- Free tier is generous enough for real prototyping, not a tease.
- Pro is the "I have a real production agent" price point — most YC startups will buy.
- Team adds compliance (SAML) which mid-market actually pays for.
- Enterprise is on-prem-friendly (the Vercel/Mastra moat we lack on cloud, we win on on-prem).

**What we will not do**: per-seat pricing (developers hate it), per-token markups (gateway's job, not ours), feature gating of OSS primitives (every Cloud feature must be replicable on self-host with effort).

---

## 7. Success metrics (north stars)

We track 4 numbers publicly on a dashboard. No vanity metrics.

| Metric | v0.1 | v0.2 | v0.3 | v1.0 |
| --- | --- | --- | --- | --- |
| **Weekly npm downloads** | 50 | 500 | 5,000 | 50,000 |
| **Production-safety suite pass rate** (our internal benchmark) | 80% | 92% | 96% | 98% |
| **Time-to-first-token** (`npm create ziro` → first agent reply) | 60s | 45s | 30s | 30s |
| **Design partners with running production agent** | 3 | 10 | 25 | 100 |

GitHub stars are reported but explicitly **not** a goal — easy to game, weak signal.

---

## 8. Risks specific to Direction A (and mitigations)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Temporal/Inngest ship their own agent SDK | High | Medium | Be the **best adapter**, not a competitor. Co-market with them — they win infra spend, we win developer mindshare. |
| Vercel AI SDK adds durability primitives in v7 | Medium | High | Our adapter abstraction is the moat — we support Temporal/Inngest/Restate equally; Vercel will likely lock to their own runtime. |
| Mastra adds gateway + durability | Medium | Medium | Ship the full Layer 2+4+6 story coherently in v0.2. Mastra is opinionated; we win unopinionated teams. |
| MCP gets superseded by A2A or new protocol | Medium | Low | Adapter pattern is protocol-agnostic. We adopt fast. |
| "Production safety" doesn't feel urgent until users get burned | High | High | Content marketing on **real** incidents ($340K avg failure cost). Free Pro license to anyone who shares a postmortem. |
| Hard to demo "doesn't crash" — feature absence is hard to sell | High | Medium | Lean on **trace replay demos** showing recovery. Make a "chaos monkey for agents" demo: kill the process mid-run, watch it resume. |
| Solo founder bus factor | Medium | Critical | Recruit co-maintainer by v0.2; transparent governance from day 1 (`GOVERNANCE.md`). |

---

## 9. Hiring & resourcing (12-month plan)

**Months 0–3 (v0.1)**: 1 founder (BDFL) full-time. Possibly 1 contractor for docs site.

**Months 3–6 (v0.2)**: + 1 senior eng (Temporal/durable execution expert), + 1 part-time DevRel.

**Months 6–9 (v0.3)**: + 1 senior eng (TS DX / SDK), + DevRel full-time.

**Months 9–12 (v1.0)**: + 1 platform eng (Ziro Cloud infra), + 1 community / DX engineer.

**Year 1 budget estimate**: $500K–1M (founder + 4 hires + infra + benchmarking API spend + conference travel). Funding path: bootstrapped → grant → seed round only if Ziro Cloud has paying pilots.

---

## 10. The "kill criteria" — when to abandon Direction A

We commit hard to A, but we are honest about when to pivot. We will reconsider direction if **all three** of the following are true at the v0.3 milestone (month 9):

1. Weekly npm downloads < 1,000 (target: 5,000).
2. Fewer than 5 design partners running an agent in production.
3. No design partner willing to pay for Ziro Cloud beta.

If 2 of 3 fail, we keep building but adjust GTM.
If 0–1 fail, we double down.

---

## 11. Operating cadence

- **Weekly**: ship a release (even patch), publish a trace teardown video, respond to all GitHub issues within 48h.
- **Monthly**: design partner sync (group call), public roadmap update, benchmark refresh.
- **Quarterly**: review this document, public quarterly report (downloads, partners, ARR if any), strategy adjustment.
- **Yearly**: governance review, RFC backlog grooming, hiring plan refresh.

---

## 12. What we explicitly defer past v1.0

To keep focus razor-sharp:

- Voice agents.
- Browser-use / Stagehand-style automation.
- Multi-agent role-play (CrewAI territory).
- No-code visual builder.
- Our own LLM hosting.
- A2A protocol (we adopt when standardized, not before).
- Marketplace for community tools.

Every "great idea" pitched to us before v1.0 gets logged in `IDEAS.md` and considered for v1.1+.

---

*This document is the contract between the project and its contributors. If we drift from it without updating it, call us out in an issue.*
