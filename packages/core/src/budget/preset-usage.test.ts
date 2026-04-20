import { describe, expect, it } from 'vitest';
import { checkAfterCall, recordUsage } from './enforce.js';
import { BudgetExceededError } from './errors.js';
import { getCurrentBudget, getCurrentScope, withBudget } from './scope.js';

describe('withBudget({ presetUsage }) — RFC 0002 budget continuity', () => {
  it('seeds the new scope with the supplied usage instead of zero', async () => {
    let observed: number | undefined;
    await withBudget(
      { maxUsd: 5 },
      async () => {
        observed = getCurrentBudget()?.used.usd;
      },
      { presetUsage: { usd: 1.23, tokens: 100, llmCalls: 2, steps: 0, durationMs: 0 } },
    );
    expect(observed).toBe(1.23);
  });

  it('counts preset usage against maxUsd limit', async () => {
    // Preset already consumed $4.50 of a $5 cap. The next $0.80 charge
    // (recorded via recordUsage + checkAfterCall) should overrun.
    let threwBudget = false;
    try {
      await withBudget(
        { maxUsd: 5 },
        async () => {
          const scope = getCurrentScope();
          if (!scope) throw new Error('no scope');
          recordUsage(scope, { totalTokens: 50 }, /* actualUsd */ 0.8);
          checkAfterCall(scope);
        },
        { presetUsage: { usd: 4.5, tokens: 0, llmCalls: 0, steps: 0, durationMs: 0 } },
      );
    } catch (err) {
      threwBudget = err instanceof BudgetExceededError;
    }
    expect(threwBudget).toBe(true);
  });

  it('does not affect a sibling scope that has no presetUsage', async () => {
    await withBudget(
      { maxUsd: 5 },
      async () => {
        expect(getCurrentBudget()?.used.usd).toBe(2);
      },
      { presetUsage: { usd: 2, tokens: 0, llmCalls: 0, steps: 0, durationMs: 0 } },
    );
    await withBudget({ maxUsd: 5 }, async () => {
      expect(getCurrentBudget()?.used.usd).toBe(0);
    });
  });

  it('preset overrides parent inheritance when both are present', async () => {
    await withBudget({ maxUsd: 10 }, async () => {
      const scope = getCurrentScope();
      if (!scope) throw new Error('no parent scope');
      recordUsage(scope, { totalTokens: 100 }, 3);
      // Open a child with explicit preset; the child should see the
      // preset usage, not the parent's $3.
      await withBudget(
        { maxUsd: 5 },
        async () => {
          expect(getCurrentBudget()?.used.usd).toBe(0.5);
        },
        { presetUsage: { usd: 0.5, tokens: 0, llmCalls: 0, steps: 0, durationMs: 0 } },
      );
    });
  });

  it('back-compat: omitting presetUsage starts the scope at zero', async () => {
    let observed: number | undefined;
    await withBudget({ maxUsd: 5 }, async () => {
      observed = getCurrentBudget()?.used.usd;
    });
    expect(observed).toBe(0);
  });
});
