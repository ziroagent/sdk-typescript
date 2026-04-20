---
'@ziro-agent/agent': minor
---

**New: multi-agent `handoffs[]` + `createNetwork()` (RFC 0007).**

Two minimal multi-agent primitives ship in `@ziro-agent/agent`. Both are deliberately small — no graph engine, no LLM-as-router. They cover the documented 80% case (specialist sub-agents + state-driven routing) without the failure modes that make "agent frameworks" notorious for runaway cost and unauditable control flow.

### `CreateAgentOptions.handoffs?: Handoff[]`

```ts
const triage = createAgent({
  name: 'triage',
  model,
  handoffs: [billingAgent, technicalAgent, refundsAgent],
});
```

Each handoff is auto-exposed to the LLM as a tool named `transfer_to_<sanitised_name>`. When the LLM calls it, the target sub-agent runs with the (optionally filtered) message history and its final text bubbles up as the tool result — same DX as `defineTool`, no new concept.

Per-handoff `inputFilter(messages)` controls what context the sub-agent sees:

```ts
handoffs: [
  {
    agent: billing,
    inputFilter: (msgs) => msgs.filter((m) => m.role !== 'system').slice(-10),
  },
],
```

Recursive handoff misconfiguration throws `HandoffLoopError` (default `maxHandoffDepth: 5`).

### `createNetwork({ agents, router })`

```ts
const network = createNetwork({
  agents: [intake, processing, finalizer],
  router: ({ stepIndex, state }) => {
    if (stepIndex === 0) return intake;
    if (state.intakeComplete && !state.processed) return processing;
    if (state.processed) return finalizer;
    return undefined; // halt
  },
});
```

The router is a **pure function** — deterministic, auditable, no LLM call. Returning `Agent` runs it, `Agent[]` runs in parallel, `undefined` halts the network. RFC 0007 explicitly rejects Inngest's `createRoutingAgent` (LLM-as-router) variant.

### Other changes

- New top-level export `agent.name` on every `Agent` (defaults to `'agent'`). Drives handoff tool names + tracing attributes.
- New exports: `Handoff`, `HandoffSpec`, `HandoffLoopError`, `handoffToolName`, `AgentRouter`, `AgentRouterContext`, `Network`, `NetworkRunOptions`, `NetworkRunResult`, `NetworkStepRecord`.
- New docs page: `apps/docs/content/docs/handoffs.mdx`.

No breaking changes — single-agent `createAgent({ ... })` users unaffected.
