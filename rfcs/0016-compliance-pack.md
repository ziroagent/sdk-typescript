# RFC 0016: Compliance starter pack (EU AI Act / SOC 2 / GDPR)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **draft** (§Detailed design sketched 2026-04; no `@ziro-agent/compliance` / `@ziro-agent/audit` package code in repo yet)
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

### 1. Package layout (target)

```
packages/compliance/
  src/eu-ai-act/template.md      # markdown skeleton, no-warranty header
  src/soc2/control-map.json    # CC1–CC9 → feature ids
  src/index.ts                  # re-exports + version
packages/audit/
  src/jsonl-writer.ts            # append + hash chain
  src/types.ts                  # AuditEvent union
```

Consumers install `@ziro-agent/compliance` and/or `@ziro-agent/audit` as normal workspace deps; **no** cloud-only endpoints required.

### 2. Audit JSONL record (target schema)

Each line is one JSON object (newline-delimited):

- **`schemaVersion`:** integer, start at `1`.
- **`ts`:** ISO-8601 UTC timestamp from writer clock.
- **`actor`:** `{ type: 'user'|'system'|'agent', id?: string }`.
- **`action`:** string enum (`checkpoint.put`, `tool.execute`, `budget.exceeded`, …).
- **`payload`:** action-specific JSON (redactable; max nested depth documented).
- **`prevHash`:** hex digest of previous line (empty string for genesis).
- **`eventHash`:** `SHA-256(prevHash + canonicalJson(payloadSubset))` — exact canonicalisation TBD (stable key order); default algorithm **SHA-256** unless hash-agility open question resolves.

### 3. `agent.deleteUserData(userId)` (target)

- **Order:** (1) pause or reject new runs for `userId` (host responsibility), (2) `checkpointer.deleteByUser(userId)` if API exists, (3) memory tiers (`WorkingMemory` / `ConversationMemory` / vector store namespaces), (4) optional hook **`onUserDataDeleted`** for trace exporters / blob stores.
- **Idempotency:** second call is no-op per sub-store; partial failure returns aggregated errors (never silent drop).

### 4. CLI `ziroagent compliance report`

- **Input:** `--framework=soc2` reads packaged `control-map.json` + resolved package versions from `package.json` / lockfile where available.
- **Output:** markdown to stdout or `--out path.md`; includes **no-warranty** footer block.

### 5. GDPR / AI Act templates

- **Static assets** only; `pnpm pack` must contain everything for air-gapped installs (RFC 0004 anti-roadmap).
- **EU AI Act** template sections: system description, intended purpose, human oversight (HITL), technical logs (audit + OTel pointers), data minimisation (egress allowlists from RFC 0013 direction).

