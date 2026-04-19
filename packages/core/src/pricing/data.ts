/**
 * Hardcoded pricing tables for the Budget Guard pre-flight estimator.
 *
 * Prices are USD per 1,000,000 tokens, matching how OpenAI / Anthropic
 * publish their rate cards. Verified 2026-04-20 against:
 *   - https://openai.com/api/pricing/
 *   - https://www.anthropic.com/pricing
 *
 * Coverage policy: every entry below was cross-checked against the live
 * pricing page on the day of merge. We deliberately do NOT include models
 * we cannot verify (e.g. recently-rotated `o1-mini`/`o3-mini`/`gpt-4.1`
 * variants) — `getPricing()` returns `undefined` for those, Budget Guard
 * falls back to the chars/4 heuristic + post-call enforcement, and the user
 * is never surprised by a wildly wrong USD bound.
 *
 * Keeping this hand-maintained for v0.1.4. RFC §Adoption proposes a
 * scheduled GitHub Action to diff this table against each provider's
 * pricing page weekly — tracked as a follow-up issue.
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
  /** Free-form note (e.g. "legacy", "flagship"). */
  notes?: string;
}

const VALID_FROM = '2026-04-20';

const ENTRIES: ModelPricing[] = [
  // --- OpenAI: current flagships (verified 2026-04-20) -------------------
  {
    provider: 'openai',
    modelId: 'gpt-5.4',
    inputPer1M: 2.5,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.25,
    validFrom: VALID_FROM,
    notes: 'flagship',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    inputPer1M: 0.75,
    outputPer1M: 4.5,
    cachedInputPer1M: 0.075,
    validFrom: VALID_FROM,
    notes: 'flagship-mini',
  },
  {
    provider: 'openai',
    modelId: 'gpt-5.4-nano',
    inputPer1M: 0.2,
    outputPer1M: 1.25,
    cachedInputPer1M: 0.02,
    validFrom: VALID_FROM,
    notes: 'flagship-nano',
  },

  // --- OpenAI: legacy still served on the API ----------------------------
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    inputPer1M: 2.5,
    outputPer1M: 10.0,
    cachedInputPer1M: 1.25,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    cachedInputPer1M: 0.075,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },

  // --- Anthropic: current flagships (verified 2026-04-20) ----------------
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-7',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cachedInputPer1M: 0.5,
    validFrom: VALID_FROM,
    notes: 'flagship',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    validFrom: VALID_FROM,
    notes: 'flagship',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5',
    inputPer1M: 1.0,
    outputPer1M: 5.0,
    cachedInputPer1M: 0.1,
    validFrom: VALID_FROM,
    notes: 'flagship',
  },

  // --- Anthropic: legacy still served on the API -------------------------
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cachedInputPer1M: 0.5,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-5',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    cachedInputPer1M: 0.5,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.3,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-1',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cachedInputPer1M: 1.5,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    cachedInputPer1M: 1.5,
    validFrom: VALID_FROM,
    notes: 'legacy',
  },
];

export const PRICING: Readonly<Record<string, ModelPricing>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((p) => [`${p.provider}/${p.modelId}`, p])),
);
