import type { TokenUsage } from '../types/usage.js';
import { type ModelPricing, PRICING } from './data.js';

export type { ModelPricing } from './data.js';
export { PRICING } from './data.js';

/** Options for {@link getPricing}. */
export interface GetPricingOptions {
  /**
   * When `true`, rows marked `unverified: true` in `data.ts` are eligible to
   * be returned. Default `false` — unverified rows are filtered out so
   * Budget Guard's pre-flight USD estimate falls back to the chars/4
   * heuristic instead of trusting a speculative price tag.
   *
   * Added in v0.1.9 per RFC 0004 §v0.1.9 trust-recovery.
   */
  allowUnverified?: boolean;
}

/**
 * Look up pricing for `${provider}/${modelId}`. Also tries common alias
 * patterns (date-stamped variants, `-latest` suffix). Returns `undefined`
 * when the SDK has no row — callers should fall back to a heuristic estimate
 * or skip pre-flight USD enforcement.
 *
 * Rows marked `unverified: true` in the pricing table are filtered out by
 * default. Pass `{ allowUnverified: true }` to opt in (e.g. for an internal
 * dashboard that wants best-effort numbers for pre-release model ids).
 */
export function getPricing(
  provider: string,
  modelId: string,
  options?: GetPricingOptions,
): ModelPricing | undefined {
  const allowUnverified = options?.allowUnverified ?? false;
  const accept = (p: ModelPricing | undefined): ModelPricing | undefined => {
    if (!p) return undefined;
    if (p.unverified === true && !allowUnverified) return undefined;
    return p;
  };

  const direct = accept(PRICING[`${provider}/${modelId}`]);
  if (direct) return direct;

  const dateStripped = modelId.replace(/-\d{8}$/, '');
  if (dateStripped !== modelId) {
    const withLatest = accept(PRICING[`${provider}/${dateStripped}-latest`]);
    if (withLatest) return withLatest;
    const bare = accept(PRICING[`${provider}/${dateStripped}`]);
    if (bare) return bare;
  }

  if (modelId.endsWith('-latest')) {
    const without = accept(PRICING[`${provider}/${modelId.slice(0, -'-latest'.length)}`]);
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
