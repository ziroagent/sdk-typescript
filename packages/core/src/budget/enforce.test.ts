import { describe, expect, it, vi } from 'vitest';
import { checkAfterCall, checkBeforeCall, recordUsage } from './enforce.js';
import { BudgetExceededError } from './errors.js';
import { _createScopeForTesting } from './scope.js';

describe('checkBeforeCall', () => {
  it('throws on USD pre-flight overrun', () => {
    const scope = _createScopeForTesting({ maxUsd: 0.01 });
    expect(() =>
      checkBeforeCall(scope, {
        minUsd: 0.001,
        maxUsd: 0.05,
        minTokens: 10,
        maxTokens: 100,
        pricingAvailable: true,
      }),
    ).toThrow(BudgetExceededError);
  });

  it('throws on token pre-flight overrun', () => {
    const scope = _createScopeForTesting({ maxTokens: 50 });
    expect(() =>
      checkBeforeCall(scope, {
        minUsd: 0,
        maxUsd: 0,
        minTokens: 10,
        maxTokens: 100,
        pricingAvailable: false,
      }),
    ).toThrowError(/tokens/);
  });

  it('throws on llmCalls pre-flight overrun', () => {
    const scope = _createScopeForTesting({ maxLlmCalls: 1 });
    scope.used.llmCalls = 1;
    expect(() => checkBeforeCall(scope, undefined)).toThrowError(/llmCalls/);
  });

  it('passes when estimate is undefined and only call-count limit is set with room', () => {
    const scope = _createScopeForTesting({ maxLlmCalls: 5 });
    expect(() => checkBeforeCall(scope, undefined)).not.toThrow();
  });
});

describe('recordUsage + checkAfterCall', () => {
  it('accumulates usage across multiple calls', () => {
    const scope = _createScopeForTesting({});
    recordUsage(scope, { promptTokens: 100, completionTokens: 50, totalTokens: 150 }, 0.01);
    recordUsage(scope, { promptTokens: 50, completionTokens: 25, totalTokens: 75 }, 0.005);
    expect(scope.used.tokens).toBe(225);
    expect(scope.used.llmCalls).toBe(2);
    expect(scope.used.usd).toBeCloseTo(0.015, 6);
  });

  it('throws when post-call USD exceeds limit', () => {
    const scope = _createScopeForTesting({ maxUsd: 0.01 });
    recordUsage(scope, { totalTokens: 100 }, 0.05);
    expect(() => checkAfterCall(scope)).toThrow(BudgetExceededError);
  });

  it('produces partialUsage on the thrown error', () => {
    const scope = _createScopeForTesting({ maxTokens: 100 });
    recordUsage(scope, { totalTokens: 200 }, 0);
    try {
      checkAfterCall(scope);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceededError);
      const e = err as BudgetExceededError;
      expect(e.kind).toBe('tokens');
      expect(e.partialUsage.tokens).toBe(200);
      expect(e.preflight).toBe(false);
    }
  });
});

describe('warnAt', () => {
  it('emits a process warning when crossing usd threshold', () => {
    const scope = _createScopeForTesting({ warnAt: { usd: 0.001 } });
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    recordUsage(scope, { totalTokens: 1 }, 0.002);
    expect(spy).toHaveBeenCalledTimes(1);
    // Re-cross does not re-fire.
    recordUsage(scope, { totalTokens: 1 }, 0.001);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
