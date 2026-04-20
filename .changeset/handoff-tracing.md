---
'@ziro-agent/agent': minor
'@ziro-agent/tracing': minor
---

Emit `ziro.agent.handoff` spans on every multi-agent handoff (RFC 0007 §Tracing).

`@ziro-agent/agent` now opens a span around each `transfer_to_<name>` tool
invocation with attributes `ziroagent.handoff.{parent.name,target.name,depth,
max_depth,chain,messages.count,input_filter.applied,reason}` — denormalised
so a query like `parent="triage" AND target="billing"` works without joining
spans. `@ziro-agent/tracing` exports the new attribute keys (`ATTR.Handoff*`,
`ATTR.AgentName`).

The span is opened via `getTracer()` so it remains a no-op until the user
calls `setTracer(...)`. No behavioural change for non-traced runs.

See `examples/multi-agent-handoff` for an end-to-end demo (triage → billing /
tech_support) plus a console-tracer harness (`otel.ts`).
