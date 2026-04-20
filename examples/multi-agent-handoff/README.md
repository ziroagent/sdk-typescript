# Multi-agent handoff (RFC 0007)

End-to-end demo of `handoffs[]` from `@ziro-agent/agent`.

## Topology

```
                ┌─────────────────────────────────────────┐
                │                triage                    │
                │  picks one transfer_to_<name> tool call │
                └─────────────────────────────────────────┘
                       │                          │
       transfer_to_billing            transfer_to_tech_support
                       ▼                          ▼
                ┌────────────┐           ┌──────────────────┐
                │  billing   │           │  tech_support    │
                │ + issue_   │           │ + lookup_ticket  │
                │   refund   │           │                  │
                └────────────┘           └──────────────────┘
```

The triage agent has no business logic — it reads the user's message,
the LLM picks `transfer_to_billing` or `transfer_to_tech_support`, and
the specialist takes over with its own tools and system prompt.

## Run

```bash
OPENAI_API_KEY=sk-... pnpm --filter @ziro-agent/example-multi-agent-handoff start
```

You'll see, for each query:

- The handoff that fired (`→ HANDOFF to "billing"`)
- The triage agent's final reply
- Token usage + finish reason

## Run with tracing spans visible

```bash
OPENAI_API_KEY=sk-... pnpm --filter @ziro-agent/example-multi-agent-handoff start:traced
```

`otel.ts` installs a tiny console tracer that prints every span as it
ends. Look for entries like:

```
  [span#3] ziro.agent.handoff (1820ms, ok)
    {"ziroagent.handoff.parent.name":"triage","ziroagent.handoff.target.name":"billing","ziroagent.handoff.depth":1,"ziroagent.handoff.max_depth":3,"ziroagent.handoff.chain":"triage>billing","ziroagent.handoff.messages.count":2,"ziroagent.handoff.input_filter.applied":false,"ziroagent.handoff.reason":"user wants a refund for a damaged order"}
```

`otel.ts` includes the snippet for swapping the console tracer out for a
real OTLP exporter (Jaeger / Honeycomb / Tempo / etc).

## What this example demonstrates

- `name` on every agent → drives the auto-generated tool name
  (`transfer_to_<name>`).
- Mixing **bare `Agent`** (`billing`) and **`HandoffSpec`**
  (`tech_support` with a custom `description`) in the same
  `handoffs[]`.
- `maxHandoffDepth: 3` → guard against runaway loops if a sub-agent
  ever transferred back.
- The triage system prompt steers the LLM toward transferring instead
  of answering itself.
- The `ziro.agent.handoff` span captures
  `parent / target / depth / chain / reason` for every transfer.

## What this example deliberately does *not* show

- **`createNetwork()` + `AgentRouter`.** That's for *deterministic*
  state-based routing (e.g. plan → write → review). See the
  `multi-agent-workflow` example for that pattern.
- **A graph engine.** RFC 0007 §"Explicitly NOT shipping" — handoffs +
  router cover the 90% case without the cognitive overhead of a DSL.
