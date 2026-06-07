import { checkAfterCall, checkBeforeCall, recordUsage } from './budget/enforce.js';
import { isBudgetExceededError } from './budget/errors.js';
import { applyResolution } from './budget/resolver.js';
import { type BudgetScope, getCurrentScope, withBudget } from './budget/scope.js';
import type { BudgetSpec, CostEstimate } from './budget/types.js';
import { InvalidArgumentError } from './errors.js';
import { costFromUsage, getPricing } from './pricing/index.js';
import type { ContentPart, ToolCallPart } from './types/content.js';
import type { FinishReason } from './types/finish-reason.js';
import type { LanguageModel, ModelCallOptions, ToolDefinitionForModel } from './types/model.js';
import type { TokenUsage } from './types/usage.js';
import { estimateTokensFromMessages } from './util/estimate-tokens.js';
import { normalizePrompt, type PromptInput } from './util/normalize-prompt.js';

export interface GenerateTextOptions extends PromptInput {
  model: LanguageModel;
  tools?: ToolDefinitionForModel[];
  toolChoice?: ModelCallOptions['toolChoice'];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  seed?: number;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * Optional Budget Guard spec. When provided, the SDK opens a fresh budget
   * scope around this call (or intersects with the parent scope from
   * `withBudget`) and enforces the limits via pre-flight + post-call checks.
   * Throws `BudgetExceededError` when crossed.
   */
  budget?: BudgetSpec;
}

export interface GenerateTextResult {
  text: string;
  content: ContentPart[];
  toolCalls: ToolCallPart[];
  finishReason: FinishReason;
  usage: TokenUsage;
  rawResponse?: unknown;
}

/**
 * Single-shot text generation. The lowest-level user-facing primitive — most
 * users should reach for `streamText` (UX) or `createAgent` (tool-use loops)
 * instead, but `generateText` is invaluable for one-off completions, evals,
 * and tests.
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
  const { model, tools, toolChoice, budget, ...rest } = options;

  const messages = normalizePrompt(rest);

  const callOptions: ModelCallOptions = {
    messages,
    ...(tools !== undefined ? { tools } : {}),
    ...(toolChoice !== undefined ? { toolChoice } : {}),
    ...(rest.temperature !== undefined ? { temperature: rest.temperature } : {}),
    ...(rest.topP !== undefined ? { topP: rest.topP } : {}),
    ...(rest.topK !== undefined ? { topK: rest.topK } : {}),
    ...(rest.maxTokens !== undefined ? { maxTokens: rest.maxTokens } : {}),
    ...(rest.stopSequences !== undefined ? { stopSequences: rest.stopSequences } : {}),
    ...(rest.seed !== undefined ? { seed: rest.seed } : {}),
    ...(rest.providerOptions !== undefined ? { providerOptions: rest.providerOptions } : {}),
    ...(rest.abortSignal !== undefined ? { abortSignal: rest.abortSignal } : {}),
    ...(rest.headers !== undefined ? { headers: rest.headers } : {}),
  };

  const exec = async (): Promise<GenerateTextResult> => {
    const scope = getCurrentScope();
    if (scope) {
      guardUsdEnforceable(model, scope);
      applyHardOutputCap(model, scope, callOptions);
      const estimate = await resolveEstimate(model, callOptions);
      checkBeforeCall(scope, estimate);
    }
    const result = await model.generate(callOptions);
    if (scope) {
      const actualUsd = computeActualUsd(model, result.usage);
      recordUsage(scope, result.usage, actualUsd);
      checkAfterCall(scope);
    }
    return {
      text: result.text,
      content: result.content,
      toolCalls: result.toolCalls,
      finishReason: result.finishReason,
      usage: result.usage,
      ...(result.rawResponse !== undefined ? { rawResponse: result.rawResponse } : {}),
    };
  };

  // The `onExceed` function-form resolver runs at the layer that **owns** the
  // scope — i.e. the call site that passed `budget`. When `generateText` is
  // invoked inside an outer `withBudget` (e.g. via `agent.run({ budget })`),
  // we deliberately propagate `BudgetExceededError` so the outer owner can
  // interpret it. The replacement value's shape is determined by the owner's
  // result type (see `BudgetOnExceed` doc comment).
  if (budget) {
    try {
      return await withBudget(budget, exec);
    } catch (err) {
      if (isBudgetExceededError(err)) {
        // We just opened this scope, so we know the owning spec.
        // Build a synthetic scope view for `applyResolution` from `budget` +
        // the error's partial-usage snapshot. (The real scope already
        // unwound when withBudget threw.)
        const syntheticScope = {
          id: err.scopeId,
          spec: budget,
          used: { ...err.partialUsage, steps: 0 },
          startedAt: 0,
          firedWarnings: new Set<string>(),
        };
        return await applyResolution<GenerateTextResult>(syntheticScope, err);
      }
      throw err;
    }
  }
  return await exec();
}

/**
 * Internal: pick the best available pre-flight estimate.
 *   1. Provider's own `estimateCost` (most accurate).
 *   2. SDK pricing table + character-based token heuristic.
 *   3. `undefined` — caller skips USD/token pre-flight, post-call still wins.
 */
export async function resolveEstimate(
  model: LanguageModel,
  options: ModelCallOptions,
): Promise<CostEstimate | undefined> {
  if (model.estimateCost) {
    try {
      return await model.estimateCost(options);
    } catch {
      // Fall through to the heuristic — never fail the user's call because
      // an estimator threw.
    }
  }
  const pricing = getPricing(model.provider, model.modelId);
  if (!pricing) return undefined;
  const inputTokens = estimateTokensFromMessages(
    options.messages as unknown as Parameters<typeof estimateTokensFromMessages>[0],
  );
  const maxOut = options.maxTokens ?? defaultOutputCap();
  const minOut = Math.min(16, maxOut);
  return {
    minTokens: inputTokens + minOut,
    maxTokens: inputTokens + maxOut,
    minUsd:
      (inputTokens * pricing.inputPer1M) / 1_000_000 + (minOut * pricing.outputPer1M) / 1_000_000,
    maxUsd:
      (inputTokens * pricing.inputPer1M) / 1_000_000 + (maxOut * pricing.outputPer1M) / 1_000_000,
    pricingAvailable: true,
  };
}

/** Used by the post-call `recordUsage` step. */
export function computeActualUsd(model: LanguageModel, usage: TokenUsage): number {
  const pricing = getPricing(model.provider, model.modelId);
  if (!pricing) return 0;
  return costFromUsage(pricing, usage);
}

/**
 * Conservative default output ceiling used to bound the pre-flight USD/token
 * estimate when the caller did not pass `maxTokens`. NOTE: this is only an
 * *estimate* input — the model is NOT actually capped to this value unless the
 * budget is `hard` (see {@link applyHardOutputCap}). A model that emits more
 * than this is billed for the real amount, caught only by the post-call check
 * AFTER the spend. Pass an explicit `maxTokens` (or a `hard` budget) for a true
 * pre-spend ceiling. See rfcs/0001-budget-guard.md.
 */
function defaultOutputCap(): number {
  return 4096;
}

// One-time, per-model warnings so a misconfigured cap is loud once, not on
// every call. Process-scoped — acceptable for an operational warning.
const warnedUnenforceableUsd = new Set<string>();

/**
 * C1 (RFC 0001): when `maxUsd` is set but the SDK has no pricing for this
 * model, actual USD resolves to $0 (see {@link computeActualUsd}), so the
 * `maxUsd` cap is silently unenforceable — the most dangerous gap relative to
 * the "throws before you burn cash" guarantee, and it bites exactly the
 * sovereign/local-model path (Ollama, vLLM) where pricing is unknown.
 *
 * Under a `hard` budget this is fatal (throws). Otherwise it warns once per
 * model so the operator knows USD is NOT being enforced (tokens / llmCalls
 * still are).
 */
function guardUsdEnforceable(model: LanguageModel, scope: BudgetScope): void {
  if (scope.spec.maxUsd === undefined) return;
  // A provider that can self-estimate OR a pricing-table hit means actual USD
  // is computable post-call, so the cumulative cap holds.
  if (getPricing(model.provider, model.modelId)) return;
  const key = `${model.provider}/${model.modelId}`;
  if (scope.spec.hard) {
    throw new InvalidArgumentError({
      argument: 'budget.maxUsd',
      message:
        `Hard budget sets maxUsd=${scope.spec.maxUsd} but no pricing is known for "${key}", ` +
        'so USD spend cannot be enforced. Add a pricing entry, drop maxUsd, or set ' +
        'budget.hard=false to downgrade this to a warning. See rfcs/0001-budget-guard.md.',
    });
  }
  if (warnedUnenforceableUsd.has(key)) return;
  warnedUnenforceableUsd.add(key);
  emitBudgetWarning(
    `[ziro-budget] maxUsd is set but no pricing is known for "${key}" — USD spend will NOT be ` +
      'enforced for this model (maxTokens / maxLlmCalls still are). Add pricing or use a hard ' +
      'budget to fail fast. See rfcs/0001-budget-guard.md.',
  );
}

/**
 * C3 (RFC 0001): for a `hard` budget with a `maxUsd` cap and no caller-supplied
 * `maxTokens`, derive the maximum output tokens the *remaining* USD can pay for
 * and inject it as `maxTokens`. This makes "throws before you burn cash" true
 * for a single output-heavy call instead of best-effort: the model physically
 * cannot emit more than the budget affords. Soft budgets keep the prior
 * behaviour (estimate only, model uncapped) to avoid silently truncating output.
 */
function applyHardOutputCap(
  model: LanguageModel,
  scope: BudgetScope,
  callOptions: ModelCallOptions,
): void {
  if (!scope.spec.hard) return;
  if (callOptions.maxTokens !== undefined) return; // caller already capped
  if (scope.spec.maxUsd === undefined) return;
  const pricing = getPricing(model.provider, model.modelId);
  if (!pricing?.outputPer1M) return;
  const inputTokens = estimateTokensFromMessages(
    callOptions.messages as unknown as Parameters<typeof estimateTokensFromMessages>[0],
  );
  const inputCost = (inputTokens * pricing.inputPer1M) / 1_000_000;
  const remainingUsd = scope.spec.maxUsd - scope.used.usd - inputCost;
  if (remainingUsd <= 0) return; // pre-flight will throw on input cost alone
  const affordableOut = Math.floor((remainingUsd / pricing.outputPer1M) * 1_000_000);
  if (affordableOut <= 0) return;
  callOptions.maxTokens = affordableOut;
}

function emitBudgetWarning(message: string): void {
  const proc = (globalThis as { process?: { emitWarning?: (m: string, n: string) => void } })
    .process;
  if (proc?.emitWarning) {
    proc.emitWarning(message, 'ZiroBudgetWarning');
  } else {
    console.warn(message);
  }
}

// Re-exported for streamText reuse.
export type { BudgetScope };
