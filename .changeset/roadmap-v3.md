---
---

docs(rfc): publish RFC 0008 Roadmap v3 (toward v1.0) + stubs 0009-0016

Synthesises 56 best-practices for agentic SDKs in 2026 into a per-feature gap
matrix (status × P0 / P1 / P2 tier) and rewrites `ROADMAP.md` milestones
v0.3 → v1.0:

- v0.3 Standards & Ecosystem (MCP server, OpenAPI tools, OTel GenAI semconv,
  mock provider, three-layer docs)
- v0.4 Memory & RAG (working / conversation memory, hybrid search, reranker,
  document ingestion, citation-first responses)
- v0.5 Safety & Governance (default-deny mutating tools, structured output,
  tenant budget)
- v0.6 Resilience (provider fallback chain, record / replay, repair tool call)
- v0.7 Multi-modal & Sandbox (audio / file parts, code interpreter, browser)
- v0.8 Sovereign & Compliance (vLLM / TGI providers, EU AI Act / SOC 2 /
  GDPR starter pack)
- v0.9 Release Candidate stabilisation
- v1.0 GA (API freeze + codemod + Ziro Cloud GA)

Spawns 8 child RFCs (0009 MCP server, 0010 OpenAPI tools, 0011 memory tiers,
0012 RAG hardening, 0013 sandbox tools, 0014 multi-modal content parts,
0015 resilience, 0016 compliance pack) as stubs to be detailed before the
corresponding milestone start.

Documentation-only — no runtime API, no version bumps. v0.1 / v0.1.9 / v0.2
sections in `ROADMAP.md` are unchanged (only `[ ] → [x]` status updates
reflecting v0.2 work shipped through April 2026).
