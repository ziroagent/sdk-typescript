import { checkAfterCall, checkBeforeCall, recordUsage } from './budget/enforce.js';
import { BudgetExceededError } from './budget/errors.js';
import { applyResolution } from './budget/resolver.js';
import { type BudgetScope, getCurrentScope, withBudget } from './budget/scope.js';
import type { BudgetSpec, CostEstimate } from './budget/types.js';
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
      if (err instanceof BudgetExceededError) {
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

/** Conservative default if the user didn't pass `maxTokens`. */
function defaultOutputCap(): number {
  return 4096;
}

// Re-exported for streamText reuse.
export type { BudgetScope };
