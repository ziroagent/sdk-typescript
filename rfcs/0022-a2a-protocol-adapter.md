# RFC 0022: A2A protocol adapter (A8)

- Start date: 2026-06-07
- Authors: @ziro-agent/maintainers
- Status: **draft** — design for review (Sprint 4 / SOTA refresh item **A8**, promoted P2→P0)
- Affected packages: new **`@ziro-agent/a2a`**
- Related: [RFC 0008 §SOTA-2026](./0008-roadmap-v3.md), [RFC 0009 — MCP server](./0009-mcp-server.md), [RFC 0007 — Handoffs & router](./0007-handoffs-and-router.md), [RFC 0002 — HITL](./0002-human-in-the-loop.md)

## Problem

MCP gives Ziro agents **tools**; it deliberately says nothing about how agents
**coordinate with each other** across processes / orgs / vendors. In 2026 that
gap is filled by **A2A** (Agent-to-Agent), donated by Google to the Linux
Foundation (2025-06), merged with ACP (2025-09), and housed under the **Agentic
AI Foundation** alongside MCP (2025-12, 100+ enterprise supporters). The "when
standardised" trigger from the original anti-roadmap entry is **met**. Ziro
ships the MCP layer of the consensus 3-layer stack (MCP tools · A2A agents ·
commerce) but **not** the A2A layer — a Ziro agent cannot be discovered by, or
delegate to, an external agent.

## Goals / non-goals

**Goals (v1 slice):**
- **Expose** a `createAgent` agent as an A2A server: publish an Agent Card,
  accept tasks, stream progress, return results. One-liner, mirroring
  `ziroagent mcp serve`.
- **Consume** a remote A2A agent as a Ziro `Handoff` target (RFC 0007) and/or a
  `Tool`, so the LLM can delegate via the existing `transfer_to_*` mechanism.
- Map A2A task lifecycle ↔ Ziro run lifecycle, including **HITL suspend/resume**
  (RFC 0002) over A2A's `input-required` state.

**Non-goals:** agent marketplace/discovery registry, A2A as the *internal*
multi-agent mechanism (handoffs stay in-process; A2A is the *cross-boundary*
escape hatch), commerce/payment extensions, provider-native response IDs.

## Design sketch

### Server — expose a Ziro agent over A2A

```ts
import { serveA2A } from '@ziro-agent/a2a';

serveA2A(agent, {
  card: { name: 'billing', description: 'Handles refunds & invoices', skills: [...] },
  transport: 'http',           // JSON-RPC/HTTP per A2A spec; stdio later
  port: 8081,
});
```

- Publishes the **Agent Card** at the well-known path; advertises skills derived
  from the agent's `name`/`description` (+ explicit overrides).
- A2A `message/send` → `agent.run({ prompt | messages })`; streams task
  status/artifacts from the agent's `onEvent` step stream.
- An `AgentSuspendedError` (HITL) maps to A2A **`input-required`**; the snapshot
  is persisted via the agent's `checkpointer`, and a follow-up A2A message
  resumes via `agent.resume`. Budget/tracing flow through unchanged.

### Client — consume a remote A2A agent

```ts
import { a2aHandoff, a2aTool } from '@ziro-agent/a2a';

const remote = a2aHandoff({ cardUrl: 'https://billing.acme/.well-known/agent.json' });
const agent = createAgent({ model, handoffs: [remote] }); // LLM picks transfer_to_billing

// or as a plain tool:
const tool = a2aTool({ cardUrl, name: 'ask_billing' });
```

- Fetches the remote Agent Card, builds a `Handoff`/`Tool` whose `execute`
  drives an A2A task to completion (streaming → final artifact), honouring
  `abortSignal` and the surrounding budget scope.
- `maxHandoffDepth` (RFC 0007) still bounds delegation chains; cross-boundary
  loop-guard via an A2A `correlationId`/depth header.

## Risks / open questions

1. **Spec version pinning** — A2A is young; isolate wire types behind an
   internal adapter (same discipline as the MCP server) so spec churn doesn't
   leak into the public surface.
2. **Auth** — A2A calls cross trust boundaries → pairs with **Q1** (agent
   identity / OAuth OBO). v1 supports a pluggable `authHeaders` hook; full OBO
   is Q1's scope.
3. **Streaming fidelity** — map Ziro step events → A2A task status/artifact
   updates without losing tool-call structure (cf. RFC 0017/0018 tails).
4. Transport: start with JSON-RPC/HTTP (the spec's baseline); add stdio later.

## Adoption

Land as `@ziro-agent/a2a` behind an RFC-tracked slice: server first
(`serveA2A` + Agent Card), then client (`a2aHandoff`/`a2aTool`), then HITL
mapping. Example: two Ziro agents coordinating over A2A. Mark **A8** done in
ROADMAP §SOTA refresh when server+client+HITL land and interop is verified
against one third-party A2A implementation.
