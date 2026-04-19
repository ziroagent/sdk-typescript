/**
 * Cosine similarity in `[-1, 1]`. Returns 0 when either vector is all-zero.
 * Throws when dimensions differ — this is almost always a configuration bug
 * and silently returning 0 would mask it.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dimensionality mismatch (${a.length} vs ${b.length})`,
    );
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] as number;
    const bv = b[i] as number;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Returns a new vector scaled so `||v|| === 1`. No-op for zero vectors. */
export function normalize(v: number[]): number[] {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i] as number;
    s += x * x;
  }
  if (s === 0) return v.slice();
  const inv = 1 / Math.sqrt(s);
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (v[i] as number) * inv;
  return out;
}
