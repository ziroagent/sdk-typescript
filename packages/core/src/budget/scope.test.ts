import { describe, expect, it } from 'vitest';
import { getCurrentBudget, intersectSpecs, withBudget } from './scope.js';

describe('withBudget', () => {
  it('opens a scope visible via getCurrentBudget()', async () => {
    expect(getCurrentBudget()).toBeUndefined();
    await withBudget({ maxUsd: 1 }, async () => {
      const ctx = getCurrentBudget();
      expect(ctx?.spec.maxUsd).toBe(1);
      expect(ctx?.used.usd).toBe(0);
    });
    expect(getCurrentBudget()).toBeUndefined();
  });

  it('propagates the scope across awaits', async () => {
    await withBudget({ maxUsd: 1 }, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      expect(getCurrentBudget()?.spec.maxUsd).toBe(1);
    });
  });

  it('cleans up the scope on throw', async () => {
    await expect(
      withBudget({ maxUsd: 1 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(getCurrentBudget()).toBeUndefined();
  });

  it('intersects nested specs (tighter wins)', async () => {
    await withBudget({ maxUsd: 5, maxTokens: 1000 }, async () => {
      await withBudget({ maxUsd: 2, maxTokens: 5000 }, async () => {
        const ctx = getCurrentBudget();
        expect(ctx?.spec.maxUsd).toBe(2);
        expect(ctx?.spec.maxTokens).toBe(1000);
      });
      // Parent unchanged.
      expect(getCurrentBudget()?.spec.maxUsd).toBe(5);
    });
  });

  it('returns the function value', async () => {
    const v = await withBudget({}, async () => 42);
    expect(v).toBe(42);
  });
});

describe('intersectSpecs', () => {
  it('takes the tighter of each numeric limit', () => {
    const r = intersectSpecs({ maxUsd: 1, maxTokens: 100 }, { maxUsd: 0.5, maxLlmCalls: 3 });
    expect(r.maxUsd).toBe(0.5);
    expect(r.maxTokens).toBe(100);
    expect(r.maxLlmCalls).toBe(3);
  });

  it('keeps undefined when neither side specifies', () => {
    const r = intersectSpecs({}, {});
    expect(r.maxUsd).toBeUndefined();
    expect(r.maxTokens).toBeUndefined();
  });
});
