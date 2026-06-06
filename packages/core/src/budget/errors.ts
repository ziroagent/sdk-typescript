import { brandZiroError as brand, isZiroError, ZiroError } from '../errors.js';
import type { BudgetUsage } from './types.js';

export type BudgetExceededKind = 'usd' | 'tokens' | 'llmCalls' | 'steps' | 'duration';

export interface BudgetExceededOptions {
  kind: BudgetExceededKind;
  limit: number;
  observed: number;
  scopeId: string;
  partialUsage: BudgetUsage;
  /**
   * When `true`, the error is thrown BEFORE the model call is dispatched —
   * the canonical "no overspend" guarantee. When `false`, the call already
   * happened and the budget was crossed by the actual usage; tokens are still
   * billed but the SDK refuses to issue any further calls.
   */
  preflight: boolean;
}

export class BudgetExceededError extends ZiroError {
  override readonly name = 'BudgetExceededError';
  readonly kind: BudgetExceededKind;
  readonly limit: number;
  readonly observed: number;
  readonly scopeId: string;
  readonly partialUsage: BudgetUsage;
  readonly preflight: boolean;

  constructor(options: BudgetExceededOptions) {
    const phase = options.preflight ? 'pre-flight' : 'post-call';
    const msg =
      `Budget exceeded (${phase}): ${options.kind} limit=${options.limit}, observed=${options.observed}` +
      ` (scope ${options.scopeId}).`;
    super(msg, { code: 'budget_exceeded' });
    this.kind = options.kind;
    this.limit = options.limit;
    this.observed = options.observed;
    this.scopeId = options.scopeId;
    this.partialUsage = options.partialUsage;
    this.preflight = options.preflight;
    brand(this);
  }
}

/**
 * Realm-safe check for {@link BudgetExceededError}. The SDK's own money-safety
 * control flow (tool execution, the agent loop, `onExceed` resolution) MUST use
 * this instead of `instanceof`: a `BudgetExceededError` thrown by one copy of
 * `@ziro-agent/core` fails `instanceof` against another copy's class (workers,
 * vm contexts, dual ESM/CJS resolution, mismatched monorepo versions). When
 * that happens with `instanceof`, the budget error silently degrades into a
 * generic error and the run keeps spending — exactly the failure this guards.
 */
export function isBudgetExceededError(value: unknown): value is BudgetExceededError {
  return isZiroError(value) && (value as ZiroError).code === 'budget_exceeded';
}
