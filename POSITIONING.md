# Positioning

> An honest answer to *"why would I use Ziro instead of X?"*

This document is intentionally blunt about where Ziro is the right tool, where it isn't, and how it compares to the dominant alternatives. We update it every release.

---

## The one-line pitch

**Ziro is the TypeScript agent runtime that survives crashes, throttles costs, and keeps audit trails — so your agent doesn't become the next $50K incident.**

If your agent only ever runs for 10 seconds, calls 1 tool, and costs $0.001, you do not need Ziro — `fetch()` and `JSON.parse()` are fine. Ziro starts paying off the moment your agent: runs for minutes/hours, calls real tools that move money or data, has a budget that matters, or is subject to compliance.

## Our singular focus: the production-safety gap

We have one bet, not three. After mapping the market we considered three possible positions:

1. **A — The Production-Safe Agent SDK** *(chosen)* — durable execution + cost guardrails + audit trail.
2. **B — The Sovereign AI Agent Stack** — on-prem + EU AI Act + zero telemetry.
3. **C — The Vietnam Enterprise AI Layer** — Zalo/MoMo/VietQR + tiếng Việt + local LLM presets.

We chose **A** as the product because it has the largest TAM (88% of agent projects fail in production = universal pain), the strongest technical moat (durable execution is genuinely hard), and the clearest demo-able value ("look, it survived 3 crashes mid-tool-call").

**B and C are not separate strategies — they are wedges into A.** Sovereign mode (B) is a feature of the production-safe SDK that wins regulated industries. Vietnam-first presets (C) are how we earn our first 5 design partners before fighting Vercel/Mastra globally. See [`STRATEGY.md`](STRATEGY.md) for the full operating playbook.

---

## The market gap we target

The 2026 enterprise agent stack has six layers:

```
6. Agent ↔ UI protocol           (AG-UI, custom SSE)
5. Observability + Evals + Guards  (Langfuse, Braintrust, LangSmith)
4. Durable execution               (Temporal, Inngest, Restate)
3. Agent orchestration             (LangGraph, Mastra, Vercel AI SDK)
2. AI / Agent gateway              (Kong, agentgateway, LiteLLM)
1. Model + Tools (MCP)             (provider SDKs, MCP servers)
```

| Layer | Vercel AI SDK | Mastra | LangGraph | **Ziro** |
| --- | --- | --- | --- | --- |
| 1. Model + Tools + MCP | ✅ Strong | ✅ Strong | ⚠️ Python-first | ✅ |
| 2. Gateway | ❌ | ⚠️ Basic | ❌ | ✅ **target** |
| 3. Orchestration | ⚠️ Basic | ✅ Good | ✅ Best | ✅ |
| 4. Durable Execution | ❌ | ⚠️ Basic | ⚠️ via Cloud | ✅ **target** |
| 5. Obs + Evals + Guards | ⚠️ DevTools only | ✅ Good | ✅ LangSmith | ✅ |
| 6. AG-UI | ⚠️ Custom | ❌ | ❌ | ✅ **target** |

**Ziro's bet**: nobody in the TypeScript ecosystem covers Layer 2 + 4 + 6 with first-class primitives in a single coherent SDK. That's the gap.

---

## Honest comparison

### vs. Vercel AI SDK

| | Vercel AI SDK | Ziro |
| --- | --- | --- |
| **Best at** | App/product SDK, React UI streaming, simple agent flows | Production-safe agents, durable workflows, sovereign deployment |
| **Provider coverage** | Excellent (20+) | Focused (5-6, deep integration) |
| **Type-safety** | Good | Equivalent (both use Zod) |
| **Durable execution** | None | First-class (Temporal/Inngest/Restate adapters) |
| **Cost guardrails** | Manual | Built-in `BudgetExceededError` |
| **MCP** | Client only (v6) | Server + Client |
| **Eval framework** | None | `defineEval` + replay |
| **Sovereign mode** | Cloud-leaning | First-class Ollama/vLLM |
| **Maintainer** | Vercel (commercial) | Independent OSS |

**Use Vercel AI SDK if**: you're building a Next.js chat app, you live inside the Vercel ecosystem, your agent is short-lived and stateless, you don't need durable execution.

**Use Ziro if**: your agent runs for minutes-to-days, costs matter, you need HITL approvals that survive deploys, you have compliance requirements, or you need to run on-prem.

### vs. Mastra

| | Mastra | Ziro |
| --- | --- | --- |
| **Best at** | Higher-level batteries-included framework, RAG + memory + workflow | Lower-level production primitives, durable + sovereign |
| **Funding** | $13M YC W25 | Bootstrapped / community |
| **Opinionated stack** | Yes (Mastra-way) | No (BYO Temporal, Langfuse, etc.) |
| **Durable execution** | Basic in-process | Temporal/Inngest/Restate adapters |
| **Sovereign / on-prem** | Cloud-first | First-class |
| **MCP server** | Client-focused | Server + Client |
| **Visual UI** | Mastra Playground (impressive) | Ziro Playground (focused on traces + evals) |

**Use Mastra if**: you want a fully assembled, opinionated agent stack with their playground, and cloud-first is fine.

**Use Ziro if**: you want unopinionated primitives you can swap (Temporal vs Inngest, Langfuse vs Braintrust, Ollama vs OpenAI), with sovereign deployment as a first-class concern.

### vs. LangGraph (TS)

| | LangGraph TS | Ziro |
| --- | --- | --- |
| **Best at** | Explicit graph state machines, stateful long-running agents | TypeScript-native DX, MCP-native, sovereign |
| **Learning curve** | Steepest in the space | Closer to Vercel AI SDK |
| **TS ergonomics** | Python-port feel | TS-native, strict types |
| **Durable execution** | LangGraph Cloud (paid) | Temporal/Inngest/Restate (OSS adapters) |
| **Ecosystem** | Massive (LangChain) | Focused, MCP-first |

**Use LangGraph if**: you need maximum explicit control over a complex graph, you're already in the LangChain ecosystem, you're OK paying for LangGraph Cloud for durability.

**Use Ziro if**: you want TS-native ergonomics, MCP-first distribution, and you'd rather use Temporal/Inngest directly than a proprietary cloud.

### vs. CrewAI / AutoGen

These are Python-first and role-play-multi-agent-focused. Ziro is not trying to compete here. If your problem is "marketing agent + writer agent + critic agent talking to each other," CrewAI is fine. Ziro is for "one agent that has to refund a real customer and not lose state when the box reboots."

---

## When Ziro is the **wrong** choice (today)

We will not pretend otherwise:

- **You need a 1-shot LLM call in a script.** Use `openai` SDK directly.
- **You're prototyping in a Jupyter notebook.** Use Python + Pydantic AI / LangChain.
- **You need 30+ providers.** Vercel AI SDK has wider coverage today.
- **You need a polished consumer chat UI out-of-the-box.** Use Vercel AI SDK + Next.js starters.
- **You need role-play multi-agent (CrewAI-style).** Wait for v0.4 or use CrewAI.
- **You can't tolerate v0.x churn.** Wait for v1.0 (planned ~Q3 2026).

---

## Strategic risks we're aware of

1. **Vercel ships durable execution.** Mitigation: our Temporal integration is deeper, our sovereign story is stronger, our OSS license is non-Vercel-controlled.
2. **Mastra adds gateway primitives.** Mitigation: we ship Layer 2 + 4 + 6 together as one coherent story; assembling 3 features one-by-one is harder than starting with the full design.
3. **LangChain TS catches up.** Mitigation: TS-native DX > Python port; MCP-first distribution > tutorial-first growth.
4. **MCP gets superseded.** Mitigation: our adapter pattern is provider-agnostic; we adopt A2A and any successor protocols.
5. **Nobody cares about sovereign mode (yet).** Mitigation: EU AI Act enforcement Aug 2026 is a hard deadline; we're early but not wrong. SEA/VN regulators following EU pattern.

---

## Vietnam & SEA niche (deliberate)

We are explicitly investing in:

- **Vietnamese-first docs and presets** (PhoGPT, VinAI, Viettel AI, FPT.AI tokenizer)
- **NestJS integration** (most VN/SEA enterprise stacks use Nest, not Next)
- **Local payment / messaging tool packs** (Zalo, MoMo, VietQR, Viettel Pay)
- **Sovereign deployment recipes for VN data residency law (Decree 13/2023)**

This is not a moat against global competitors — it's a wedge to win design partners locally before fighting the global TAM. v0.1-v0.5 will explicitly serve VN/SEA design partners; we earn the right to fight Vercel/Mastra globally only after we've proven production reliability somewhere.

---

## How to challenge this positioning

If you read this and disagree with any of the above — open an issue with the `positioning` label or a PR to this file. Positioning is a living document. We update it every minor release based on what design partners and the community tell us we got wrong.
