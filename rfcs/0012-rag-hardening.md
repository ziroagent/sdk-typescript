# RFC 0012: RAG hardening (hybrid + rerank + ingestion + citations)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design in progress; first code slice landed 2026-04)
- Affected packages: `@ziro-agent/memory`
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.4) and §A rows E2, E3, E4, E5, E6

## Summary

Turn `@ziro-agent/memory` from a thin "vector store + chunker + embedder"
package into a production-grade retrieval pipeline: **hybrid search** (semantic
+ BM25 + RRF) by default, **reranker middleware** as a composable step,
**document ingestion** beyond plain text (PDF / CSV / MD / DOCX / image OCR),
and **citation-first responses** (every retrieved chunk traceable in the
output).

## Scope

- `hybridSearch({ query, k, weights })` returning fused results from semantic
  + BM25 channels via Reciprocal Rank Fusion. Default behaviour for
  `store.search()` once both channels are configured.
- `RerankerAdapter` interface + reference adapters: Cohere, Voyage, BGE
  (local). Reranker is a pure pipeline step, not a coupled feature of any
  store.
- `loadDocument(uri, options)` autodetect by extension / MIME with adapter
  registry: PDF (`pdf-parse`), CSV (built-in), MD (`remark`), DOCX (`mammoth`),
  image OCR (Tesseract or remote vision-model adapter).
- Citation-first output type: retrieval helpers return
  `{ chunks: RetrievedChunk[], cite(text): TextWithCitations }` so every RAG
  answer surfaces chunk IDs in the response.
- Vector adapters expansion: Qdrant, Pinecone, Weaviate, Chroma (P1 per RFC
  0008 row E6).

## Non-goals

- Full document-management UI (uploads, versioning) — dashboard product.
- Auto-pipeline orchestration ("ingest a Drive folder on schedule") — leave
  to consumer + cron / Inngest.
- Embedding-model fine-tuning — out of scope for SDK.

## Implementation notes (2026-04)

Landed in `@ziro-agent/memory`:

- **Hybrid + RRF**: in-memory `BM25Index`, `reciprocalRankFusion`, and
  `MemoryVectorStore.search({ strategy: 'hybrid', text, embedding? })` (BM25 +
  dense cosine, then RRF). `pgvector` and other stores: hybrid still TBD.
- **Citations**: `buildTextWithCitations`, `TextWithCitations`, `RetrievedChunk` /
  `toRetrievedChunk`.
- **Reranker**: `RerankerAdapter` + `passthroughReranker`; **`retrieve()`**;
  **`createCohereReranker`** / **`createVoyageReranker`** (hosted HTTP rerank).
- **Hybrid on Postgres**: `PgVectorStore` FTS (`plainto_tsquery` + `ts_rank_cd`)
  fused with dense order via RRF; `defaultSearchStrategy` option.
- **Ingestion slice**: **`loadDocument()`** for local files (UTF-8 text types +
  optional `pdf-parse`); full adapter registry (DOCX, OCR, …) still TBD.

## Open questions (defer to detailed design)

- BM25 implementation: ship a JS impl or require Postgres `tsvector` /
  Meilisearch adapter? Trade-off: zero-dep vs. quality. *(Partially resolved:
  zero-dep JS BM25 ships for `MemoryVectorStore` hybrid.)*
- Default fusion weights for RRF (Pinecone uses 60/40 alpha, others vary).
- Citation format: inline (`[1]`) markers or out-of-band `citations` array
  only? Default in RFC 0008 §C: out-of-band only.

## Detailed design

TBD before v0.4 milestone start. Owner to draft.
