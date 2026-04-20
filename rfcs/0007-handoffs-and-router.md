# RFC 0007: Multi-agent — `handoffs[]` + deterministic `router`

- Start date: 2026-04-22
- Authors: @ziro-agent/maintainers
- Status: **draft (stub)** — design comments open per `GOVERNANCE.md` until 2026-05-06
- Affected packages: `@ziro-agent/agent`
- Tracks: v0.3 Track 2 (RFC 0004)

## Summary

Add two minimal multi-agent primitives to `@ziro-agent/agent`:

1. **`handoffs: Agent[]`** on `CreateAgentOptions` — handoffs auto-expose as
   tools to the LLM, with optional per-handoff `inputFilter(messages)` to
   control what message history is passed through. Modelled on OpenAI Agents
   JS.
2. **`router?: AgentRouter`** — a function-form, **deterministic** state-based
   router that selects which agent handles the next step. Modelled on Inngest
   Agent Kit's `Network.router` *function form*, explicitly **rejecting** the
   `createRoutingAgent` (LLM-as-router) variant.

This RFC explicitly **rejects** building a full graph engine like LangGraph —
`@ziro-agent/workflow` already covers the small graph case, and the
production-safety thesis prefers deterministic routing over LLM-driven control
flow.

## Motivation

Per RFC 0004 §v0.3 Adoption matrix:

- **OpenAI Agents JS / `handoffs[]`** — clean, single-field API; LLM picks the
  next agent via tool-call. Production-proven at OpenAI scale.
- **Inngest Agent Kit / state-based router** — function-form router gives
  deterministic, auditable control flow. Same project's `createRoutingAgent`
  adds an opaque LLM call per step that we explicitly reject.

Multi-agent coordination is the #1 unmet ask after Production-Safety in our
design-partner backlog. The smallest possible primitive that ships the value
is what this RFC scopes — explicitly *not* a graph framework.

## Detailed design (sketch — to be expanded)

### `handoffs: Agent[]`

```ts
const triageAgent = createAgent({
  model,
  system: 'You triage customer messages to the right specialist agent.',
  handoffs: [billingAgent, technicalAgent, refundsAgent],
});

const result = await triageAgent.run({ input: 'I was double-charged' });
```

Internally each handoff exposes as a tool named `transfer_to_<agentName>` with
schema `{ reason?: string }`. When the LLM calls it, control transfers to the
target agent with the *filtered* message history.

### `inputFilter`

```ts
const billingAgent = createAgent({ /* ... */ });

createAgent({
  model,
  handoffs: [
    {
      agent: billingAgent,
      inputFilter: (messages) =>
        messages.filter((m) => m.role !== 'system').slice(-10),
    },
  ],
});
```

Default filter: pass full message history. Override to control context
pollution (a documented production failure mode).

### `router: AgentRouter`

```ts
type AgentRouter = (ctx: {
  messages: Message[];
  state: Record<string, unknown>;
  stepIndex: number;
  lastAgent?: Agent;
  lastResult?: AgentRunResult;
}) => Agent | Agent[] | undefined;

const network = createNetwork({
  agents: [intakeAgent, processingAgent, finalizerAgent],
  router: ({ stepIndex, state }) => {
    if (stepIndex === 0) return intakeAgent;
    if (state.intakeComplete && !state.processed) return processingAgent;
    if (state.processed) return finalizerAgent;
    return undefined; // halt
  },
});

const result = await network.run({ input: 'process this order' });
```

Router returning `undefined` halts the network. Router returning `Agent[]`
runs them in parallel and merges results.

### Explicitly NOT shipping (anti-roadmap)

- **`createRoutingAgent` / LLM-as-router** — opaque per-step LLM cost,
  non-auditable control flow. Documented in RFC 0004 anti-roadmap.
- **Handoff graph visualization as 1st-class** — premature complexity; the
  existing `apps/playground` trace timeline already shows handoff
  transitions.
- **Cross-language agents** (Python sub-agents, .NET sub-agents). TS-native
  is the value prop.

### Budget + tracing interaction

- Budget scope is **inherited** across handoffs by default (the parent agent's
  `BudgetSpec` flows through `AsyncLocalStorage`). Per-handoff budgets via
  `withBudget` inside the target agent's tool definitions.
- Each handoff emits a `ziro.agent.handoff` span with `from`, `to`, `reason`
  attributes — slots into the existing `instrumentAgent()` tracer.
- HITL approvals on a handoff target tool work unchanged; the
  `AgentSnapshot` captures the active handoff stack so `agent.resume()` lands
  in the right sub-agent.

## Drawbacks

- Two new concepts to teach (`handoffs` + `router`). Mitigation: separate docs
  pages, one cookbook each, decision tree in `comparison.mdx` for "do I want
  handoff, router, or workflow?"
- Risk of users reaching for `router` when they should use
  `@ziro-agent/workflow`. Mitigation: explicit guidance in docs — "use router
  when state determines next agent; use workflow when steps form a fixed DAG".
- Multi-agent budget accounting can confuse users. Mitigation: bench-driven
  defaults plus a `printBudgetTree(network)` debug helper.

## Alternatives

- **No multi-agent primitive at all** — push users to compose
  `agent.run` calls manually. Rejected: every design partner reinvents the
  same handoff-as-tool pattern; better to standardise.
- **Full LangGraph-style graph engine.** Rejected: contradicts the
  production-safety thesis and the anti-roadmap; complexity not justified by
  the 80% case.
- **LLM-as-router (Inngest's `createRoutingAgent`).** Rejected: opaque
  per-step cost, non-auditable, fails the "every primitive has a budget +
  trace + retry story" guiding principle.
- **Handoffs as Workflow nodes.** Rejected: forces the user into
  `@ziro-agent/workflow` for the simple case where one agent simply picks the
  next one mid-conversation.

## Adoption strategy

- New API; non-breaking. Existing single-agent `createAgent({ ... })` users
  unaffected.
- v0.2 Checkpointer (RFC 0006) prerequisite: handoff stack must persist across
  resume; coordinate snapshot version bump.
- Migration cookbook: from "spawn three agents and route in user code" to
  `handoffs: [...]` + `router`.

## Unresolved questions

- **Naming**: `network` vs `team` vs `crew` vs `system`. Inngest uses
  `Network`; OpenAI doesn't have a multi-agent container at all. Lean
  `Network` for now.
- **Parallel handoff merging**: when `router` returns `Agent[]`, how do we
  merge their results? Current sketch: array of `AgentRunResult`. Should we
  ship a `reducer` option for synthesis?
- **Handoff loop detection**: a triage agent that calls itself recursively
  needs a max-depth bound. Default: `maxHandoffDepth: 10`, throws
  `HandoffLoopError`.
- **Sub-agent eval coverage**: should `runEval` enumerate all reachable
  agents and require coverage per agent? Or punt to v0.3.1?
- **Tool name collisions**: two handoff targets both named
  `transfer_to_billing`. Disambiguate by namespacing
  (`transfer_to_<network_name>__<agent_name>`)?
