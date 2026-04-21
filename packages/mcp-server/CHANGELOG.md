# @ziro-agent/mcp-server

## 0.2.1

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/tools@0.5.0

## 0.2.0

### Minor Changes

- [#32](https://github.com/ziroagent/sdk-typescript/pull/32) [`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Add v0.4 memory and RAG primitives: hybrid search on `MemoryVectorStore` and `PgVectorStore` (FTS + dense + RRF), `retrieve()` with optional Cohere/Voyage rerankers, `loadDocument()` for local text and PDF (via `pdf-parse`), working and conversation memory plus `createAgent({ memory })`. Standard Schema support in `@ziro-agent/tools`. New `@ziro-agent/mcp-server` and `@ziro-agent/openapi`, CLI `ziroagent mcp serve`, and `@ziro-agent/core/testing` mock/record helpers.

### Patch Changes

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/tools@0.4.2
