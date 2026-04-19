/**
 * Configuration for {@link chunkText}.
 *
 * - `chunkSize` and `chunkOverlap` are measured in **characters**, not tokens.
 *   This is intentional: it is the fastest, runtime-agnostic unit of work
 *   and trivially debuggable. For token-aware chunking, encode upstream and
 *   pass the encoded units through.
 * - `separators` are tried in order; the chunker recurses on the largest
 *   separator that yields chunks below `chunkSize`. This mirrors the
 *   well-known "recursive character text splitter" behavior used in popular
 *   RAG stacks and keeps semantic units together when possible.
 */
export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  /** Trim whitespace from each emitted chunk. Default true. */
  trim?: boolean;
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

/**
 * Recursively split `text` into overlapping chunks. Empty inputs yield `[]`.
 * Output chunks always satisfy `chunk.length <= chunkSize` after trimming
 * (with the exception of degenerate cases where a single token exceeds
 * `chunkSize` — that token is emitted whole).
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 1000;
  const chunkOverlap = options.chunkOverlap ?? 100;
  const separators = options.separators ?? DEFAULT_SEPARATORS;
  const trim = options.trim !== false;

  if (chunkSize <= 0) throw new Error('chunkSize must be > 0');
  if (chunkOverlap < 0 || chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be in [0, chunkSize)');
  }
  if (!text) return [];

  const splits = splitRecursive(text, chunkSize, separators);
  const merged = mergeWithOverlap(splits, chunkSize, chunkOverlap);
  return trim ? merged.map((s) => s.trim()).filter((s) => s.length > 0) : merged;
}

function splitRecursive(text: string, chunkSize: number, separators: string[]): string[] {
  if (text.length <= chunkSize) return [text];
  const [sep, ...rest] = separators;
  if (sep === undefined) return [text];
  if (sep === '') {
    // Hard split on character boundaries — last resort.
    const out: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) out.push(text.slice(i, i + chunkSize));
    return out;
  }
  const parts = text.split(sep);
  const out: string[] = [];
  for (const part of parts) {
    if (part.length <= chunkSize) {
      out.push(part);
    } else {
      out.push(...splitRecursive(part, chunkSize, rest));
    }
  }
  return out;
}

function mergeWithOverlap(parts: string[], chunkSize: number, overlap: number): string[] {
  const out: string[] = [];
  let buf = '';
  for (const p of parts) {
    if (buf.length === 0) {
      buf = p;
      continue;
    }
    const candidate = buf + (needsSpace(buf, p) ? ' ' : '') + p;
    if (candidate.length <= chunkSize) {
      buf = candidate;
    } else {
      out.push(buf);
      const tail = overlap > 0 ? buf.slice(-overlap) : '';
      buf = tail + (tail && needsSpace(tail, p) ? ' ' : '') + p;
      // Single part that exceeds chunkSize even with overlap stripped — flush.
      while (buf.length > chunkSize) {
        out.push(buf.slice(0, chunkSize));
        buf = buf.slice(chunkSize - overlap);
      }
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

function needsSpace(left: string, right: string): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const l = left[left.length - 1] as string;
  const r = right[0] as string;
  return !/\s/.test(l) && !/\s/.test(r);
}
