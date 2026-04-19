export type {
  Document,
  EmbeddedDocument,
  EmbeddingModel,
  Metadata,
  SearchResult,
  VectorQuery,
  VectorStore,
} from './types.js';

export { chunkText, type ChunkOptions } from './chunker.js';
export { createOpenAIEmbedder, type OpenAIEmbeddingOptions } from './embedder.js';
export { MemoryVectorStore, type MemoryVectorStoreOptions } from './stores/memory.js';
export { cosineSimilarity, normalize } from './util/cosine.js';
