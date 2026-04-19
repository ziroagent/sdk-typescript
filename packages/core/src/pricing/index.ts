import type { TokenUsage } from '../types/usage.js';
import { type ModelPricing, PRICING } from './data.js';

export type { ModelPricing } from './data.js';
export { PRICING } from './data.js';

/**
 * Look up pricing for `${provider}/${modelId}`. Also tries common alias
 * patterns (date-stamped variants, `-latest` suffix). Returns `undefined`
 * when the SDK has no row — callers should fall back to a heuristic estimate
 * or skip pre-flight USD enforcement.
 */
export function getPricing(provider: string, modelId: string): ModelPricing | undefined {
  const direct = PRICING[`${provider}/${modelId}`];
  if (direct) return direct;

  // Strip date suffix (e.g. `claude-3-5-sonnet-20241022` -> `claude-3-5-sonnet`).
  const dateStripped = modelId.replace(/-\d{8}$/, '');
  if (dateStripped !== modelId) {
    const withLatest = PRICING[`${provider}/${dateStripped}-latest`];
    if (withLatest) return withLatest;
    const bare = PRICING[`${provider}/${dateStripped}`];
    if (bare) return bare;
  }

  // Try without `-latest` suffix the user may have included.
  if (modelId.endsWith('-latest')) {
    const without = PRICING[`${provider}/${modelId.slice(0, -'-latest'.length)}`];
    if (without) return without;
  }

  return undefined;
}

/**
 * Compute USD billed for a single completed call.
 *
 * Rules:
 * - `cachedPromptTokens` are billed at `cachedInputPer1M` (or `inputPer1M`
 *   when the provider doesn't publish a cache rate); the remainder of
 *   `promptTokens` bills at `inputPer1M`.
 * - `completionTokens` bill at `outputPer1M`.
 * - `reasoningTokens` bill at `outputPer1M * (reasoningMultiplier ?? 1)`.
 */
export function costFromUsage(pricing: ModelPricing, usage: TokenUsage): number {
  const cached = usage.cachedPromptTokens ?? 0;
  const prompt = usage.promptTokens ?? 0;
  const billableInput = Math.max(0, prompt - cached);
  const cachedRate = pricing.cachedInputPer1M ?? pricing.inputPer1M;
  const reasoningMul = pricing.reasoningMultiplier ?? 1;
  const reasoning = usage.reasoningTokens ?? 0;
  const completion = usage.completionTokens ?? 0;
  return (
    (billableInput * pricing.inputPer1M) / 1_000_000 +
    (cached * cachedRate) / 1_000_000 +
    (completion * pricing.outputPer1M) / 1_000_000 +
    (reasoning * pricing.outputPer1M * reasoningMul) / 1_000_000
  );
}
