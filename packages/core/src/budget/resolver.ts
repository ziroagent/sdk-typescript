import type { BudgetExceededError } from './errors.js';
import { type BudgetScope, toContext } from './scope.js';
import type { BudgetResolution } from './types.js';

/**
 * Internal: invoke `BudgetSpec.onExceed` when it's the function form.
 *
 * Call sites (`generateText`, `streamText`, `agent.run`) wrap their budget
 * checks in try/catch and call this on `BudgetExceededError`. If the resolver
 * returns `{ handled: true, replacement }`, the call site returns
 * `replacement` (cast to its own result type) instead of re-throwing. If the
 * resolver returns `{ handled: false }` or throws itself, the original error
 * is propagated so the caller still sees a `BudgetExceededError`.
 *
 * **Type safety caveat**: `replacement` is `unknown`. The user's resolver is
 * responsible for returning a value shape-compatible with the calling
 * function's result type — the SDK does no runtime validation. This is
 * documented on `BudgetOnExceed` in `types.ts`. Type-parameterized
 * resolution is a v0.2 follow-up.
 *
 * Returns `null` when the spec's `onExceed` is not the function form (i.e.
 * `'throw'`, `'truncate'`, or undefined). Callers should propagate the
 * error in that case (and the agent layer additionally interprets
 * `'truncate'` itself).
 */
export async function resolveOnExceed(
  scope: BudgetScope,
  error: BudgetExceededError,
): Promise<BudgetResolution | null> {
  const onExceed = scope.spec.onExceed;
  if (typeof onExceed !== 'function') return null;

  try {
    const result = await onExceed(toContext(scope));
    return result;
  } catch (resolverErr) {
    // Resolver itself threw — surface that, NOT the original budget error.
    // We attach the original as `cause` so it isn't lost.
    if (resolverErr instanceof Error) {
      (resolverErr as Error & { cause?: unknown }).cause = error;
    }
    throw resolverErr;
  }
}

/**
 * Convenience: when a call site catches a budget error, run it through
 * `resolveOnExceed`. Returns either the replacement value (when handled) or
 * re-throws the original error.
 *
 * Generic over `T` so the call site can express what the replacement is
 * supposed to be — note this is a **compile-time** assertion only; the
 * runtime value comes from the user's resolver as-is.
 */
export async function applyResolution<T>(
  scope: BudgetScope,
  error: BudgetExceededError,
): Promise<T> {
  const resolution = await resolveOnExceed(scope, error);
  if (resolution?.handled) {
    return resolution.replacement as T;
  }
  throw error;
}
