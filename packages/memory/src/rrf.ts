/**
 * Reciprocal Rank Fusion (Cormack et al.) — RFC 0012 default merge for hybrid
 * lexical + dense channels. `k` defaults to 60 (common in literature).
 */

export interface RankedId {
  readonly id: string;
}

const DEFAULT_RRF_K = 60;

/**
 * Fuse multiple ordered lists of ids. Higher score = better.
 */
export function reciprocalRankFusion(
  rankedLists: ReadonlyArray<ReadonlyArray<RankedId | string>>,
  k = DEFAULT_RRF_K,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      if (item === undefined) continue;
      const id = typeof item === 'string' ? item : item.id;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    }
  }
  return scores;
}
