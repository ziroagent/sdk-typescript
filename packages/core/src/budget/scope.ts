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

export function createScope(spec: BudgetSpec, parent?: BudgetScope): BudgetScope {
  const merged = parent ? intersectSpecs(parent.spec, spec) : spec;
  return {
    id: makeScopeId(),
    spec: merged,
    used: parent ? { ...parent.used } : emptyBudgetUsage(),
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

type ALSCtor = new <T>() => {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
};

let als: {
  getStore(): BudgetScope | undefined;
  run<R>(store: BudgetScope, fn: () => R): R;
} | null = null;
let alsResolved = false;

function getAls() {
  if (alsResolved) return als;
  alsResolved = true;
  try {
    // Lazy require so non-Node runtimes can still import the module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('node:async_hooks') as { AsyncLocalStorage: ALSCtor };
    als = new mod.AsyncLocalStorage<BudgetScope>();
  } catch {
    als = null;
  }
  return als;
}

/**
 * Open a budget scope around `fn`. Nested calls to `withBudget` (or any SDK
 * call that consults `getCurrentScope()`) inherit and intersect with this
 * scope automatically when AsyncLocalStorage is available.
 */
export async function withBudget<R>(spec: BudgetSpec, fn: () => Promise<R> | R): Promise<R> {
  const parent = getCurrentScope();
  const scope = createScope(spec, parent);
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
  if (storage === null) {
    return await runIt();
  }
  return await storage.run(scope, runIt);
}

export function getCurrentScope(): BudgetScope | undefined {
  return getAls()?.getStore();
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
