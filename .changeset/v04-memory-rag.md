---
'@ziro-agent/memory': minor
'@ziro-agent/agent': minor
'@ziro-agent/tools': patch
'@ziro-agent/core': patch
'@ziro-agent/cli': patch
'@ziro-agent/mcp-server': minor
'@ziro-agent/openapi': minor
---

Add v0.4 memory and RAG primitives: hybrid search on `MemoryVectorStore` and `PgVectorStore` (FTS + dense + RRF), `retrieve()` with optional Cohere/Voyage rerankers, `loadDocument()` for local text and PDF (via `pdf-parse`), working and conversation memory plus `createAgent({ memory })`. Standard Schema support in `@ziro-agent/tools`. New `@ziro-agent/mcp-server` and `@ziro-agent/openapi`, CLI `ziroagent mcp serve`, and `@ziro-agent/core/testing` mock/record helpers.
