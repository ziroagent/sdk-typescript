import type { SearchResult } from './types.js';

/**
 * Citation-first RAG output (RFC 0012 row E2 — minimal structured shape).
 * Callers attach model-generated `answer` plus the retrieved chunks that
 * grounded it; UIs can render `citations` as footnotes or side-panels.
 */
export interface CitationEntry {
  readonly chunkId: string;
  readonly score: number;
  readonly snippet: string;
}

export interface TextWithCitations {
  readonly text: string;
  readonly citations: ReadonlyArray<CitationEntry>;
}

const SNIP = 240;

export function buildTextWithCitations(
  answer: string,
  chunks: ReadonlyArray<SearchResult>,
): TextWithCitations {
  const citations: CitationEntry[] = chunks.map((c) => ({
    chunkId: c.id,
    score: c.score,
    snippet:
      c.text.length <= SNIP ? c.text : `${c.text.slice(0, SNIP)}${c.text.length > SNIP ? '…' : ''}`,
  }));
  return { text: answer, citations };
}
