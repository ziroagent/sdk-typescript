import { fireScopeEnd, fireScopeStart } from './observer.js';
import {
  type BudgetContext,
  type BudgetSpec,
  type BudgetUsage,
  emptyBudgetUsage,
} from './types.js';

/**
 * Internal mutable scope object. Held by AsyncLocalStorage and mutated by
 * `enforce.ts` helpers. Not exported — consumers see `BudgetContext`.
 */
export interface BudgetScope {
  readonly id: string;
  readonly spec: BudgetSpec;
  readonly used: BudgetUsage;
  readonly startedAt: number;
  /** Track which `warnAt` thresholds have already fired so we only warn once. */
  readonly firedWarnings: Set<string>;
}

export function createScope(
  spec: BudgetSpec,
  parent?: BudgetScope,
  presetUsage?: BudgetUsage,
): BudgetScope {
  const merged = parent ? intersectSpecs(parent.spec, spec) : spec;
  // `presetUsage` (RFC 0002) lets `agent.resume` open a fresh scope that
  // inherits prior accumulated spend. It overrides the parent inheritance —
  // resume scopes never have a parent in practice, but if both are supplied
  // we trust the explicit preset.
  const seed: BudgetUsage = presetUsage
    ? { ...presetUsage }
    : parent
      ? { ...parent.used }
      : emptyBudgetUsage();
  return {
    id: makeScopeId(),
    spec: merged,
    used: seed,
    startedAt: Date.now(),
    firedWarnings: new Set<string>(),
  };
}

/**
 * RFC §"Composition" — child scopes inherit and intersect with the parent.
 * Each numeric limit becomes the tighter of the two; warn thresholds are
 * unioned (whichever fires first wins).
 */
export function intersectSpecs(parent: BudgetSpec, child: BudgetSpec): BudgetSpec {
  const tighter = (a: number | undefined, b: number | undefined) =>
    a === undefined ? b : b === undefined ? a : Math.min(a, b);
  return {
    maxUsd: tighter(parent.maxUsd, child.maxUsd),
    maxTokens: tighter(parent.maxTokens, child.maxTokens),
    maxLlmCalls: tighter(parent.maxLlmCalls, child.maxLlmCalls),
    maxSteps: tighter(parent.maxSteps, child.maxSteps),
    maxDurationMs: tighter(parent.maxDurationMs, child.maxDurationMs),
    warnAt: { ...parent.warnAt, ...child.warnAt },
    onExceed: child.onExceed ?? parent.onExceed,
  };
}

export function toContext(scope: BudgetScope): BudgetContext {
  const { spec, used, id } = scope;
  const remaining: BudgetContext['remaining'] = {};
  if (spec.maxUsd !== undefined) remaining.usd = Math.max(0, spec.maxUsd - used.usd);
  if (spec.maxTokens !== undefined) remaining.tokens = Math.max(0, spec.maxTokens - used.tokens);
  if (spec.maxLlmCalls !== undefined)
    remaining.llmCalls = Math.max(0, spec.maxLlmCalls - used.llmCalls);
  if (spec.maxDurationMs !== undefined)
    remaining.durationMs = Math.max(0, spec.maxDurationMs - (Date.now() - scope.startedAt));
  return {
    spec,
    used: { ...used, durationMs: Date.now() - scope.startedAt },
    remaining,
    scopeId: id,
  };
}

let counter = 0;
function makeScopeId(): string {
  counter = (counter + 1) >>> 0;
  return `bg_${Date.now().toString(36)}_${counter.toString(36)}`;
}

// --- AsyncLocalStorage-backed implicit scope -------------------------------
//
// We import `node:async_hooks` statically. Both ESM and CJS builds emit a real
// module-level import that Node resolves immediately. The package targets
// Node >=20.10 (see `engines`), so the module is always available; no lazy
// fallback is necessary. A previous lazy-`require()` based implementation
// silently fell back to `null` under pure ESM (where `require` is undefined),
// which broke implicit budget-scope propagation across `await` boundaries.

import { AsyncLocalStorage } from 'node:async_hooks';

let als: AsyncLocalStorage<BudgetScope> | null = null;

function getAls(): AsyncLocalStorage<BudgetScope> {
  if (als === null) {
    als = new AsyncLocalStorage<BudgetScope>();
  }
  return als;
}

export interface WithBudgetOptions {
  /**
   * Seed the new scope's `BudgetUsage` instead of starting from zero.
   * Used by `agent.resume` (RFC 0002) so spend, tokens, and call counts
   * accumulated before a HITL suspension carry forward into the resumed
   * run — a multi-hour pause cannot accidentally bypass a `maxUsd` cap.
   *
   * When the new scope inherits a parent (i.e. `withBudget` is nested),
   * `presetUsage` overrides the parent's usage as the seed for *this*
   * scope. The parent scope itself is unaffected.
   */
  presetUsage?: BudgetUsage;
}

/**
 * Open a budget scope around `fn`. Nested calls to `withBudget` (or any SDK
 * call that consults `getCurrentScope()`) inherit and intersect with this
 * scope automatically when AsyncLocalStorage is available.
 */
export async function withBudget<R>(
  spec: BudgetSpec,
  fn: () => Promise<R> | R,
  options?: WithBudgetOptions,
): Promise<R> {
  const parent = getCurrentScope();
  const scope = createScope(spec, parent, options?.presetUsage);
  const storage = getAls();
  fireScopeStart(toContext(scope));
  const runIt = async () => {
    try {
      const result = await fn();
      fireScopeEnd(toContext(scope), 'ok');
      return result;
    } catch (err) {
      fireScopeEnd(toContext(scope), 'error');
      throw err;
    }
  };
  return await storage.run(scope, runIt);
}

export function getCurrentScope(): BudgetScope | undefined {
  return getAls().getStore();
}

export function getCurrentBudget(): BudgetContext | undefined {
  const scope = getCurrentScope();
  return scope ? toContext(scope) : undefined;
}

/**
 * Test-only escape hatch — open a scope and return it without executing a
 * function. Mutating the returned scope from outside ALS is allowed but
 * `getCurrentScope()` will only see it inside the corresponding `run` call.
 */
export function _createScopeForTesting(spec: BudgetSpec): BudgetScope {
  return createScope(spec);
}
