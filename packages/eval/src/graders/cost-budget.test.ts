import { describe, expect, it } from 'vitest';
import type { GraderContext } from '../types.js';
import { costBudget } from './cost-budget.js';

const ctx = (usage?: GraderContext['budgetUsage']): GraderContext => {
  const c: GraderContext = { case: { input: null }, durationMs: 100 };
  if (usage) c.budgetUsage = usage;
  return c;
};

describe('costBudget grader', () => {
  it('throws at construction when no caps are set', () => {
    expect(() => costBudget({})).toThrow(/at least one/);
  });

  it('passes when usage is under all caps', async () => {
    const r = await costBudget({ maxUsd: 0.05, maxTokens: 1000 }).grade(
      null,
      null,
      ctx({ usd: 0.01, tokens: 200, llmCalls: 1, steps: 1, durationMs: 50 }),
    );
    expect(r.passed).toBe(true);
  });

  it('fails when usd exceeds cap', async () => {
    const r = await costBudget({ maxUsd: 0.01 }).grade(
      null,
      null,
      ctx({ usd: 0.5, tokens: 100, llmCalls: 1, steps: 1, durationMs: 50 }),
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/usd/);
  });

  it('fails when llmCalls exceeds cap', async () => {
    const r = await costBudget({ maxLlmCalls: 1 }).grade(
      null,
      null,
      ctx({ usd: 0, tokens: 0, llmCalls: 5, steps: 1, durationMs: 0 }),
    );
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/llmCalls/);
  });

  it('fails clearly when no usage was captured', async () => {
    const r = await costBudget({ maxUsd: 1 }).grade(null, null, ctx());
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/no budget usage/);
  });
});
