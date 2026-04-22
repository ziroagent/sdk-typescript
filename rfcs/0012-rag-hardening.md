# RFC 0012: RAG hardening (hybrid + rerank + ingestion + citations)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **draft** (§Detailed design sketched 2026-04; first code slice landed 2026-04; ingestion registry + non-PG store hybrid parity still open)
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

### 1. Retrieval pipeline (conceptual order)

For a single user query string `q`:

1. **Embed** `q` with the configured embedder (if dense channel used).
2. **Retrieve** two ranked lists (or one if hybrid disabled):
   - **Dense:** cosine (or provider-specific distance) over stored vectors.
   - **Sparse:** BM25 over chunk text (`MemoryVectorStore`) or Postgres
     `tsvector` + `ts_rank_cd` (`PgVectorStore` hybrid path).
3. **Fuse** with **Reciprocal Rank Fusion (RRF)** when both lists exist; else
   pass through the single channel.
4. **Rerank** (optional): `RerankerAdapter` receives `(query, candidates)` and
   returns the same items in a new order with optional score metadata; default
   **`passthroughReranker`** is a no-op.
5. **Shape output** as `RetrievedChunk[]` and, when citations are required,
   **`TextWithCitations`** via `buildTextWithCitations` / `cite()` helpers.

Public orchestration entry: **`retrieve()`** composes store search + rerank
where configured.

### 2. RRF contract

- Inputs: two or more ranked lists of chunk ids (or chunk payloads with stable
  ids).
- Fusion: standard RRF score `sum_i 1 / (k + rank_i)` with shared constant
  **`k`** (implementation-defined default; tunable later if we expose options).
- **Tie-breaking:** deterministic by chunk id lexical order after RRF score to
  keep tests stable across runs.

### 3. Citation contract (out-of-band default)

- Every `RetrievedChunk` carries a stable **`id`** (and ideally `sourceRef` /
  byte range when available).
- Generated answers that use RAG SHOULD attach citations as a structured
  **`citations`** array (or `TextWithCitations` shape) mapping spans of the
  answer text to chunk ids — **not** rely on inline `[n]` footnotes as the
  only machine-readable signal.
- Inline numeric markers remain a **presentation** concern for apps that want
  them; the SDK types favour out-of-band citation metadata.

### 4. Store parity matrix (target)

| Store | Dense | Sparse / BM25 | RRF in `search()` | Notes |
|-------|-------|-----------------|-------------------|--------|
| `MemoryVectorStore` | yes | in-process BM25 | yes | reference impl |
| `PgVectorStore` | yes | FTS (`plainto_tsquery`) | yes | landed |
| Other adapters (Qdrant, Pinecone, …) | yes | **TBD** | **TBD** | E6 — either ship sidecar BM25 or delegate to host FTS |

### 5. Ingestion adapter registry (target)

- **`loadDocument(uri, options)`** remains the user-facing entry.
- **Registry** maps `(extension | mime)` → adapter with `parse(buffer | path)
  -> { text, metadata }`.
- **Adapters** are optional peer deps (`pdf-parse`, future `mammoth`, OCR) so
  core install stays lean; missing adapter → clear error naming the optional
  package.
- **Security:** max bytes / page count defaults to guard PDF bomb and OCR cost;
  documented per adapter.
