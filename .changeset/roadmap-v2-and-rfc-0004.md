---
---

**Roadmap v2 + RFC 0004 (governance)**

Restructured `ROADMAP.md` v0.2 → v1.0 to absorb the strongest patterns from a
12-SDK competitive review (Vercel AI SDK v6, Mastra, LangGraph JS, OpenAI Agents
JS, Strands Agents, Inngest Agent Kit, Convex Durable Agents, PydanticAI, Letta,
Genkit, AutoGen, LiteLLM) while explicitly rejecting patterns that violate the
production-safety thesis or the OSS-first promise.

Three structural changes (full rationale in `rfcs/0004-roadmap-v2.md`):

1. **Adoption matrix per milestone.** Each v0.2+ milestone now declares — in a
   3-column table — which competitor pattern it inspires from, what we keep,
   and what we reject. "Why ship this and not that" is now auditable.
2. **Reorder v0.2** to lead with `LanguageModelMiddleware` and `Checkpointer`.
   These two primitives are 2-week shippable and unlock the gateway,
   guardrails, cache, and durable-without-Temporal stories simultaneously,
   instead of waiting 6-8 weeks on three durable-execution adapters.
3. **Insert v0.1.9 housekeeping milestone** before v0.2 to close docs/README
   /Sovereign-pillar gaps surfaced during the review — restoring trust before
   adding new feature surface area.

This is an empty changeset because no shipped package code changes; it documents
a governance change so the next `Version Packages` PR carries the rationale.
Companion design RFCs land separately:

- RFC 0005 — `LanguageModelMiddleware` (v0.2 Track 1)
- RFC 0006 — `Checkpointer` + resumable streams (v0.2 Track 2)
- RFC 0007 — Handoffs + deterministic router (v0.3 Track 2)
