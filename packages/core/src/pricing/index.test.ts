import { describe, expect, it } from 'vitest';
import { costFromUsage, getPricing } from './index.js';

describe('getPricing', () => {
  it('returns a row for a known verified model', () => {
    const p = getPricing('openai', 'gpt-4o-mini');
    expect(p?.inputPer1M).toBeGreaterThan(0);
    expect(p?.outputPer1M).toBeGreaterThan(0);
    expect(p?.unverified).toBeFalsy();
  });

  it('strips a trailing date stamp to find the bare entry', () => {
    // gpt-4o is verified; gpt-4o-20260101 should resolve to it.
    const p = getPricing('openai', 'gpt-4o-20260101');
    expect(p?.modelId).toBe('gpt-4o');
  });

  it('strips trailing -latest when looking up bare ids', () => {
    const p = getPricing('anthropic', 'claude-opus-4-latest');
    expect(p?.modelId).toBe('claude-opus-4');
  });

  it('returns undefined for unknown ids', () => {
    expect(getPricing('mystery', 'whatever')).toBeUndefined();
  });

  // ---- v0.1.9 unverified flag (RFC 0004 §trust-recovery) ----
  it('hides unverified rows by default', () => {
    expect(getPricing('openai', 'gpt-5.4')).toBeUndefined();
    expect(getPricing('anthropic', 'claude-opus-4-7')).toBeUndefined();
  });

  it('returns unverified rows when allowUnverified: true', () => {
    const p = getPricing('openai', 'gpt-5.4', { allowUnverified: true });
    expect(p?.modelId).toBe('gpt-5.4');
    expect(p?.unverified).toBe(true);
  });

  it('falls through unverified rows in the alias path by default', () => {
    // claude-sonnet-4-6 is unverified; lookup should resolve to undefined
    // even via the date-stamp / -latest aliases.
    expect(getPricing('anthropic', 'claude-sonnet-4-6-20260101')).toBeUndefined();
    expect(getPricing('anthropic', 'claude-sonnet-4-6-latest')).toBeUndefined();
  });

  it('resolves unverified rows via aliases when opted in', () => {
    const p = getPricing('anthropic', 'claude-sonnet-4-6-20260101', {
      allowUnverified: true,
    });
    expect(p?.modelId).toBe('claude-sonnet-4-6');
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
