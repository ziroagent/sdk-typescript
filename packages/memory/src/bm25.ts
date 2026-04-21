/**
 * Tiny in-memory Okapi BM25 over tokenized documents (RFC 0012 — lexical channel
 * for hybrid search). English-ish tokenisation: lowercase alphanumerics.
 */

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

export function tokenize(text: string): string[] {
  const m = text.toLowerCase().match(/[a-z0-9]+/g);
  return m ?? [];
}

interface DocStats {
  id: string;
  termFreq: Map<string, number>;
  len: number;
}

export class BM25Index {
  private readonly docs: DocStats[] = [];
  private readonly df = new Map<string, number>();
  private avgdl = 0;
  private n = 0;

  constructor(
    raw: ReadonlyArray<{ id: string; text: string }>,
    private readonly k1 = DEFAULT_K1,
    private readonly b = DEFAULT_B,
  ) {
    for (const { id, text } of raw) {
      const terms = tokenize(text);
      const termFreq = new Map<string, number>();
      for (const t of terms) {
        termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
      }
      const len = terms.length || 1;
      this.docs.push({ id, termFreq, len });
      const seen = new Set<string>();
      for (const t of termFreq.keys()) {
        if (seen.has(t)) continue;
        seen.add(t);
        this.df.set(t, (this.df.get(t) ?? 0) + 1);
      }
    }
    this.n = this.docs.length;
    this.avgdl = this.n === 0 ? 0 : this.docs.reduce((s, d) => s + d.len, 0) / Math.max(this.n, 1);
  }

  /** BM25 score for one document vs query terms (higher = more relevant). */
  scoreDoc(queryTerms: readonly string[], doc: DocStats): number {
    if (queryTerms.length === 0 || this.n === 0) return 0;
    let s = 0;
    for (const q of queryTerms) {
      const df = this.df.get(q) ?? 0;
      if (df === 0) continue;
      const idf = Math.log((this.n - df + 0.5) / (df + 0.5) + 1);
      const f = doc.termFreq.get(q) ?? 0;
      if (f === 0) continue;
      const denom = f + this.k1 * (1 - this.b + (this.b * doc.len) / (this.avgdl || 1));
      s += idf * ((f * (this.k1 + 1)) / denom);
    }
    return s;
  }

  /** Rank all documents by BM25 score for `queryText`, descending. */
  search(queryText: string): { id: string; score: number }[] {
    const qterms = tokenize(queryText);
    if (qterms.length === 0) return this.docs.map((d) => ({ id: d.id, score: 0 }));
    const out: { id: string; score: number }[] = [];
    for (const d of this.docs) {
      out.push({ id: d.id, score: this.scoreDoc(qterms, d) });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }
}
