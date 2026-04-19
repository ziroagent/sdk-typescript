import type { BudgetExceededError } from './errors.js';
import type { BudgetContext } from './types.js';

/**
 * Internal observer hook so an external layer (notably `@ziro-agent/tracing`)
 * can mirror budget lifecycle into OTel spans/events without `core` taking a
 * hard dependency on the tracing package.
 *
 * Every method is invoked synchronously from `withBudget` / `recordUsage` /
 * `enforce.*`. Implementations MUST NOT throw — exceptions are swallowed
 * (`try/catch` in the call sites) so an instrumentation bug never breaks the
 * user's program. They also MUST be cheap; a budget scope can fire dozens of
 * `usage` events in a tight agent loop.
 *
 * The interface is deliberately tiny (5 methods) and considered
 * **internal-stable**: we will not break it within v0.1, but it is not part
 * of the user-facing API and may grow as the agent layer adds step events.
 */
export interface BudgetObserver {
  onScopeStart?(ctx: BudgetContext): void;
  onScopeEnd?(ctx: BudgetContext, outcome: 'ok' | 'error'): void;
  onUsageUpdate?(ctx: BudgetContext): void;
  onWarning?(ctx: BudgetContext, kind: string, observed: number, threshold: number): void;
  onExceeded?(ctx: BudgetContext, error: BudgetExceededError): void;
}

let observer: BudgetObserver | null = null;

/**
 * Install (or clear with `null`) the process-wide budget observer. Calling
 * twice replaces the previous observer — only one observer is active.
 *
 * @returns The previously-registered observer, useful for chaining or restore
 *          patterns in tests.
 */
export function setBudgetObserver(next: BudgetObserver | null): BudgetObserver | null {
  const prev = observer;
  observer = next;
  return prev;
}

/** @internal — called by `scope.ts` / `enforce.ts`; never call this directly. */
export function fireScopeStart(ctx: BudgetContext): void {
  if (!observer?.onScopeStart) return;
  try {
    observer.onScopeStart(ctx);
  } catch {
    // observer bugs MUST NOT escape into user code.
  }
}

/** @internal */
export function fireScopeEnd(ctx: BudgetContext, outcome: 'ok' | 'error'): void {
  if (!observer?.onScopeEnd) return;
  try {
    observer.onScopeEnd(ctx, outcome);
  } catch {
    /* swallow */
  }
}

/** @internal */
export function fireUsageUpdate(ctx: BudgetContext): void {
  if (!observer?.onUsageUpdate) return;
  try {
    observer.onUsageUpdate(ctx);
  } catch {
    /* swallow */
  }
}

/** @internal */
export function fireWarning(
  ctx: BudgetContext,
  kind: string,
  observed: number,
  threshold: number,
): void {
  if (!observer?.onWarning) return;
  try {
    observer.onWarning(ctx, kind, observed, threshold);
  } catch {
    /* swallow */
  }
}

/** @internal */
export function fireExceeded(ctx: BudgetContext, error: BudgetExceededError): void {
  if (!observer?.onExceeded) return;
  try {
    observer.onExceeded(ctx, error);
  } catch {
    /* swallow */
  }
}

/** @internal — test helper to inspect whether an observer is installed. */
export function _hasObserverForTesting(): boolean {
  return observer !== null;
}
