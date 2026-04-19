/**
 * Budget Guard primitives — see RFC 0001.
 *
 * Every type here is opt-in: passing no `BudgetSpec` to a call site keeps the
 * pre-Budget behaviour. Once a spec is attached, the SDK throws
 * `BudgetExceededError` (or invokes `onExceed`) BEFORE issuing any call that
 * would push usage past a limit. See `enforce.ts` for the runtime semantics.
 */

/** Cost / usage accumulator within a budget scope. */
export interface BudgetUsage {
  /** Best-effort USD spent within the scope, computed from pricing tables. */
  usd: number;
  /** Total tokens billed (input + output + reasoning). */
  tokens: number;
  /** Number of LLM calls attributed to this scope. */
  llmCalls: number;
  /** Number of agent steps (only meaningful inside `agent.run`). */
  steps: number;
  /** Wall-clock milliseconds since the scope was opened. */
  durationMs: number;
}

export const emptyBudgetUsage = (): BudgetUsage => ({
  usd: 0,
  tokens: 0,
  llmCalls: 0,
  steps: 0,
  durationMs: 0,
});

/**
 * Soft warning thresholds. Crossing one emits a warning event but does NOT
 * throw — useful for paging Ops before things blow up.
 */
export interface BudgetWarnAt {
  usd?: number;
  tokens?: number;
  /** Percentage (0-100) of the matching `max*` value that triggers the warning. */
  pctOfMax?: number;
}

/**
 * What to do when a hard limit is crossed. Defaults to `'throw'`.
 *
 * - `'throw'`: synchronously throw `BudgetExceededError` before the next call.
 * - `'truncate'`: meaningful only for the agent loop (`agent.run`) — the
 *   loop returns whatever has been generated so far plus a `budgetExceeded`
 *   summary on the result. At the `generateText` / `streamText` layers this
 *   is currently treated as `'throw'` (documented as such).
 * - function: invoked with the current `BudgetContext`; the resolver returns
 *   a `BudgetResolution`. When `handled: true`, the SDK call returns the
 *   `replacement` value instead of throwing — useful for fallback-to-cheaper
 *   model patterns. **The resolver is responsible for returning a
 *   replacement shape compatible with the calling function's result type;
 *   the SDK does no runtime validation.** A type-parameterized
 *   `BudgetResolution<T>` is planned for v0.2.
 *
 *   Available since v0.1.6.
 */
export type BudgetOnExceed =
  | 'throw'
  | 'truncate'
  | ((ctx: BudgetContext) => Promise<BudgetResolution> | BudgetResolution);

export interface BudgetResolution {
  /** When `false`, the layer above propagates the original throw. */
  handled: boolean;
  /**
   * Replacement value to surface from the SDK call when `handled: true`.
   * Must match the calling function's result type (e.g.
   * `GenerateTextResult` for `generateText`, `AgentRunResult` for
   * `agent.run`). Not validated at runtime.
   */
  replacement?: unknown;
}

/** Public, user-facing budget specification. Every field is optional. */
export interface BudgetSpec {
  /** Hard ceiling in USD for the entire scope. */
  maxUsd?: number;
  /** Hard ceiling in input + output (+ reasoning) tokens. */
  maxTokens?: number;
  /** Max total LLM calls within the scope (an agent step may make 0+ LLM calls). */
  maxLlmCalls?: number;
  /** Max agent steps. Only enforced by `agent.run` (v0.1.5+). */
  maxSteps?: number;
  /** Wall-clock timeout in milliseconds for the entire scope. */
  maxDurationMs?: number;
  /** Soft warning thresholds (no throw). */
  warnAt?: BudgetWarnAt;
  /** Behaviour when a hard limit is hit. Default `'throw'`. */
  onExceed?: BudgetOnExceed;
}

/** Snapshot of a scope's current state, passed to `onExceed` callbacks. */
export interface BudgetContext {
  readonly spec: BudgetSpec;
  readonly used: BudgetUsage;
  readonly remaining: { usd?: number; tokens?: number; llmCalls?: number; durationMs?: number };
  readonly scopeId: string;
}

/**
 * Pre-flight cost / token estimate returned by `LanguageModel.estimateCost`
 * (or by the in-core fallback estimator when a provider does not implement it).
 */
export interface CostEstimate {
  /** Lower bound — assumes a model that emits very few output tokens. */
  minUsd: number;
  /** Upper bound — assumes the model fills `maxTokens` (or the model default). */
  maxUsd: number;
  minTokens: number;
  maxTokens: number;
  /** Did the estimator have pricing data? When `false`, USD bounds are 0. */
  pricingAvailable: boolean;
}
