import type { ConversationMemory } from './conversation-memory.js';
import type { MemoryProcessor } from './memory-processor.js';
import type { VectorStore } from './types.js';
import type { WorkingMemory } from './working-memory.js';

/**
 * Optional three-tier attachment for `createAgent({ memory })` (RFC 0011).
 *
 * - **working** — injected into the first `system` message (or a new system
 *   prefix) before each LLM step.
 * - **processors** — run in order after working injection.
 * - **conversation** — final message transform (e.g. sliding window).
 * - **longTerm** — not used by the agent loop; exposed on {@link Agent} for
 *   tools / RAG code to share one configured {@link VectorStore}.
 */
export interface AgentMemoryConfig {
  working?: WorkingMemory;
  processors?: MemoryProcessor[];
  conversation?: ConversationMemory;
  longTerm?: VectorStore;
}
