# RFC 0016: Compliance starter pack (EU AI Act / SOC 2 / GDPR)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design TBD before v0.8 milestone start)
- Affected packages: `@ziro-agent/compliance` (new), `@ziro-agent/audit` (new or rolled in)
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.8) and §A row O5

## Summary

Ship a `@ziro-agent/compliance` package providing the **templates and runtime
hooks** an enterprise needs to deploy Ziro under EU AI Act, SOC 2, and GDPR
regimes — without turning Ziro into a compliance-as-a-cloud-service. Templates
are markdown / JSON; runtime hooks are opt-in. No legal advice; explicit
no-warranty disclaimer.

## Scope

- **EU AI Act risk-assessment template** (`@ziro-agent/compliance/eu-ai-act`):
  markdown skeleton mapping Ziro primitives (HITL, budget, audit log,
  egress allowlist) to the Act's "high-risk" controls.
- **SOC 2 control mapping** (`@ziro-agent/compliance/soc2`): JSON file mapping
  Ziro features to CC1–CC9 controls; consumed by auditors and by a CLI report.
- **GDPR data-deletion runtime**: `agent.deleteUserData(userId)` propagating
  across `Checkpointer`, `Memory`, and (where the backend supports it) trace
  exporters.
- **Audit log** (`@ziro-agent/audit`): append-only JSONL with `prevHash` +
  `eventHash` per record. Already promised in RFC 0004's v0.3 matrix; rolled
  into RFC 0016 to consolidate compliance surface.
- CLI: `ziroagent compliance report --framework=soc2` emits a markdown report
  for auditors.

## Non-goals

- Compliance-as-a-cloud-service — every primitive must work fully offline /
  air-gapped (RFC 0004 anti-roadmap).
- A registry of "certified" Ziro deployments — that's a Ziro Cloud feature,
  not an SDK feature.
- Replacing legal counsel — README and every template carry an explicit
  no-warranty notice.

## Open questions (defer to detailed design)

- Hash chain: SHA-256 (default) or hash-agility (allow consumer to pick)?
- Audit log storage: JSONL file (default), or also ship a Postgres adapter?
- GDPR right-to-portability (export user data) — included in v1.0 or P1?
- Should the EU AI Act template be opinionated about classifying Ziro
  consumers as "providers" vs. "deployers" of high-risk systems? (Likely
  no — the consumer's lawyers decide.)

## Detailed design

TBD before v0.8 milestone start. Owner to draft.
