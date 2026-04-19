import { describe, expect, it } from 'vitest';
import { costFromUsage, getPricing } from './index.js';

describe('getPricing', () => {
  it('returns a row for a known model', () => {
    const p = getPricing('openai', 'gpt-4o-mini');
    expect(p?.inputPer1M).toBeGreaterThan(0);
    expect(p?.outputPer1M).toBeGreaterThan(0);
  });

  it('strips a trailing date stamp to find the bare entry', () => {
    const p = getPricing('anthropic', 'claude-sonnet-4-6-20260101');
    expect(p?.modelId).toBe('claude-sonnet-4-6');
  });

  it('strips trailing -latest when looking up bare ids', () => {
    const p = getPricing('anthropic', 'claude-opus-4-latest');
    expect(p?.modelId).toBe('claude-opus-4');
  });

  it('returns undefined for unknown ids', () => {
    expect(getPricing('mystery', 'whatever')).toBeUndefined();
  });
});

describe('costFromUsage', () => {
  const pricing = {
    provider: 'openai' as const,
    modelId: 'test',
    inputPer1M: 1.0,
    outputPer1M: 4.0,
    cachedInputPer1M: 0.5,
    validFrom: '2026-04-20',
  };

  it('prices a plain prompt + completion', () => {
    const cost = costFromUsage(pricing, {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(5.0, 6);
  });

  it('discounts cached prompt tokens', () => {
    const cost = costFromUsage(pricing, {
      promptTokens: 1_000_000,
      cachedPromptTokens: 1_000_000,
      completionTokens: 0,
    });
    expect(cost).toBeCloseTo(0.5, 6);
  });

  it('bills reasoning at output rate by default', () => {
    const cost = costFromUsage(pricing, {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(4.0, 6);
  });

  it('honours reasoningMultiplier when set', () => {
    const cost = costFromUsage(
      { ...pricing, reasoningMultiplier: 2 },
      { reasoningTokens: 1_000_000 },
    );
    expect(cost).toBeCloseTo(8.0, 6);
  });
});
