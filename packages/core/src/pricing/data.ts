/**
 * Hardcoded pricing tables for the Budget Guard pre-flight estimator.
 *
 * Prices are USD per 1,000,000 tokens, matching how OpenAI / Anthropic
 * publish their rate cards. Verified 2026-04-22 against:
 *   - https://openai.com/api/pricing/
 *   - https://www.anthropic.com/pricing
 *
 * Coverage policy:
 * - Entries whose `validFrom` date AND model id can be cross-referenced
 *   against the live provider pricing page on the day of merge are
 *   verified (default; `unverified` omitted or `false`).
 * - Entries for speculative / pre-release / NDA-only model IDs that
 *   cannot be cross-referenced are marked `unverified: true`. They are
 *   excluded from `getPricing()` by default — callers must opt in via
 *   `getPricing(provider, modelId, { allowUnverified: true })`. Budget
 *   Guard treats them as "no pricing" and falls back to the chars/4
 *   heuristic + post-call enforcement, the same path as for unknown
 *   models. The user is never surprised by a wildly wrong USD bound.
 *
 * The `unverified` flag was introduced in v0.1.9 per RFC 0004's trust-
 * recovery milestone — every entry whose `validFrom` cannot be tied to a
 * live provider page must carry it.
 *
 * Keeping this hand-maintained for v0.1.x. Weekly drift check runs in
 * `pricing-drift.yml`; the v0.2 plan is a scheduled GitHub Action that
 * diffs this table against each provider's pricing page and opens a PR.
 */

export interface ModelPricing {
  provider: 'openai' | 'anthropic';
  modelId: string;
  /** USD per 1,000,000 input tokens. */
  inputPer1M: number;
  /** USD per 1,000,000 output tokens. */
  outputPer1M: number;
  /** USD per 1,000,000 cache-hit input tokens, when the provider distinguishes. */
  cachedInputPer1M?: number;
  /**
   * Reasoning multiplier applied to `reasoningTokens` BEFORE billing as output.
   * Today both OpenAI o-series and Anthropic extended-thinking bill reasoning
   * at the regular output rate, so this defaults to 1 — kept as an explicit
   * field so future rate-card changes do not require a code change.
   */
  reasoningMultiplier?: number;
  /** ISO date the pricing was verified against the provider's published page. */
  validFrom: string;
  /**
   * `true` when the row's `modelId` and/or rate cannot currently be
   * cross-referenced against the live provider pricing page (e.g.
   * pre-release ids, NDA models, speculative future variants).
   *
   * `getPricing()` filters these out by default to prevent wildly-wrong
   * USD pre-flight estimates leaking into production. Pass
   * `{ allowUnverified: true }` to opt in.
   *
   * Added in v0.1.9 per RFC 0004 §v0.1.9 trust-recovery.
   */
  unverified?: boolean;
  /** Free-form note (e.g. "legacy", "flagship", "speculative — see notes"). */
  notes?: string;
}

const VALID_FROM = '2026-04-22';

const ENTRIES: ModelPricing[] = [
  // --- OpenAI: speculative 2026 ids (unverified — pre-release) ----------
  // These rows existed in v0.1.4 carrying a "verified" tag they could not
  // honour against any public OpenAI pricing page. Marked `unverified` in
  // v0.1.9 so pre-flight USD enforcement no longer trusts them silently.
  {
    provider: 'openai',
    modelId: 'gpt-5.4',
    inputPer1M: 2.5,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.25,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — flagship placeholder',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    inputPer1M: 0.75,
    outputPer1M: 4.5,
    cachedInputPer1M: 0.075,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — flagship-mini placeholder',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.4-nano',
    inputPer1M: 0.2,
    outputPer1M: 1.25,
    cachedInputPer1M: 0.02,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — flagship-nano placeholder',
  },

  // --- OpenAI: verified against https://openai.com/api/pricing/ ----------
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    inputPer1M: 2.5,
    outputPer1M: 10.0,
    cachedInputPer1M: 1.25,
    validFrom: VALID_FROM,
    notes: 'flagship-stable',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    cachedInputPer1M: 0.075,
    validFrom: VALID_FROM,
    notes: 'flagship-mini',
  },

  // --- Anthropic: speculative ids (unverified — pre-release) -------------
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-7',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cachedInputPer1M: 0.5,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — flagship placeholder',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — flagship placeholder',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5',
    inputPer1M: 1.0,
    outputPer1M: 5.0,
    cachedInputPer1M: 0.1,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — flagship placeholder',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cachedInputPer1M: 0.5,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — legacy placeholder',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    validFrom: VALID_FROM,
    unverified: true,
    notes: 'speculative — legacy placeholder',
  },

  // --- Anthropic: verified against https://www.anthropic.com/pricing -----
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    validFrom: VALID_FROM,
    notes: 'flagship-stable',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-1',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cachedInputPer1M: 1.5,
    validFrom: VALID_FROM,
    notes: 'legacy-stable',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cachedInputPer1M: 1.5,
    validFrom: VALID_FROM,
    notes: 'legacy-stable',
  },
];

export const PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((p) => [`${p.provider}/${p.modelId}`, p])),
);
