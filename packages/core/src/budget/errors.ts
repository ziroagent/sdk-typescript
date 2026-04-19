import { ZiroError } from '../errors.js';
import type { BudgetUsage } from './types.js';

const ZIRO_ERROR_BRAND = '__ziro_error__';

function brand<T extends ZiroError>(err: T): T {
  Object.defineProperty(err, ZIRO_ERROR_BRAND, { value: true, enumerable: false });
  return err;
}

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
