import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './rrf.js';

describe('reciprocalRankFusion', () => {
  it('boosts ids that appear high in multiple lists', () => {
    const fused = reciprocalRankFusion(
      [
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ id: 'b' }, { id: 'a' }, { id: 'd' }],
      ],
      60,
    );
    const sorted = [...fused.entries()].sort((x, y) => y[1] - x[1]);
    expect(sorted[0]?.[0]).toBe('a');
    expect(sorted[1]?.[0]).toBe('b');
  });
});
