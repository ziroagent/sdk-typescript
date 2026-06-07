import { describe, expect, it } from 'vitest';
import { resolveJsonJudgeModel } from './json-judge-model.js';

describe('resolveJsonJudgeModel', () => {
  it('returns mock model with default response', () => {
    const m = resolveJsonJudgeModel({ kind: 'mock' });
    expect(m.provider).toBe('mock');
  });

  it('rejects unknown kind', () => {
    expect(() => resolveJsonJudgeModel({ kind: 'groq' })).toThrow(/unsupported judgeModel/);
  });
});
