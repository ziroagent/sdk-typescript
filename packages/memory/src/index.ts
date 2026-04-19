export { type ChunkOptions, chunkText } from './chunker.js';
export { createOpenAIEmbedder, type OpenAIEmbeddingOptions } from './embedder.js';
export { MemoryVectorStore, type MemoryVectorStoreOptions } from './stores/memory.js';
export type {
  Document,
  EmbeddedDocument,
  EmbeddingModel,
  Metadata,
  SearchResult,
  VectorQuery,
  VectorStore,
} from './types.js';
export { cosineSimilarity, normalize } from './util/cosine.js';
