import type { TokenUsage } from '../types/usage.js';
import { BudgetExceededError, type BudgetExceededKind } from './errors.js';
import { fireExceeded, fireUsageUpdate, fireWarning } from './observer.js';
import { type BudgetScope, toContext } from './scope.js';
import type { CostEstimate } from './types.js';

/**
 * Pre-flight check. Throws `BudgetExceededError` BEFORE the model call is
 * dispatched if the upper bound of `estimate` would push usage past any
 * configured `max*`. The "min" half of the estimate is intentionally ignored
 * here — pre-flight is the conservative path.
 */
export function checkBeforeCall(scope: BudgetScope, estimate: CostEstimate | undefined): void {
  bumpDuration(scope);
  enforceDuration(scope, /* preflight */ true);

  // llmCalls — about to make one more.
  enforce(scope, 'llmCalls', scope.spec.maxLlmCalls, scope.used.llmCalls + 1, /* preflight */ true);

  if (estimate) {
    enforce(
      scope,
      'usd',
      scope.spec.maxUsd,
      scope.used.usd + estimate.maxUsd,
      /* preflight */ true,
    );
    enforce(
      scope,
      'tokens',
      scope.spec.maxTokens,
      scope.used.tokens + estimate.maxTokens,
      /* preflight */ true,
    );
  }
}

/**
 * Records actual usage from a completed call. Always called even on a
 * subsequent `checkAfterCall` throw, so partial usage is accurate when the
 * error surfaces.
 */
export function recordUsage(scope: BudgetScope, usage: TokenUsage, actualUsd: number): void {
  scope.used.llmCalls += 1;
  scope.used.usd += Number.isFinite(actualUsd) ? actualUsd : 0;
  const tokens =
    usage.totalTokens ??
    (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0) + (usage.reasoningTokens ?? 0);
  scope.used.tokens += tokens;
  bumpDuration(scope);
  fireUsageUpdate(toContext(scope));
  fireWarnings(scope);
}

/**
 * Post-call enforcement. Even if pre-flight passed, the actual usage may have
 * crossed a limit — refuse to allow another call by throwing now.
 */
export function checkAfterCall(scope: BudgetScope): void {
  bumpDuration(scope);
  enforce(scope, 'usd', scope.spec.maxUsd, scope.used.usd, /* preflight */ false);
  enforce(scope, 'tokens', scope.spec.maxTokens, scope.used.tokens, /* preflight */ false);
  enforce(scope, 'llmCalls', scope.spec.maxLlmCalls, scope.used.llmCalls, /* preflight */ false);
  enforceDuration(scope, /* preflight */ false);
}

/**
 * Mid-stream enforcement for `streamText`. Unlike `checkAfterCall`, this is
 * called against a **projected** total (current scope usage + the in-flight
 * stream's accumulated estimate) WITHOUT mutating the scope — the actual
 * `recordUsage` only runs once the stream's `finish` event arrives.
 *
 * `llmCalls` is intentionally NOT checked here: the call hasn't completed
 * yet, so it isn't part of the running total. Pre-flight already enforced
 * that we had room for one more LLM call.
 *
 * Throws `BudgetExceededError` with `preflight: false` so consumers can
 * distinguish a mid-stream abort from a pre-call refusal.
 */
export function checkMidStream(
  scope: BudgetScope,
  projectedTokens: number,
  projectedUsd: number,
): void {
  bumpDuration(scope);
  enforceDuration(scope, /* preflight */ false);
  enforce(
    scope,
    'tokens',
    scope.spec.maxTokens,
    scope.used.tokens + projectedTokens,
    /* preflight */ false,
  );
  enforce(scope, 'usd', scope.spec.maxUsd, scope.used.usd + projectedUsd, /* preflight */ false);
}

function enforce(
  scope: BudgetScope,
  kind: BudgetExceededKind,
  limit: number | undefined,
  observed: number,
  preflight: boolean,
): void {
  if (limit === undefined) return;
  if (observed <= limit) return;
  const err = new BudgetExceededError({
    kind,
    limit,
    observed,
    scopeId: scope.id,
    partialUsage: { ...scope.used },
    preflight,
  });
  fireExceeded(toContext(scope), err);
  throw err;
}

function enforceDuration(scope: BudgetScope, preflight: boolean): void {
  if (scope.spec.maxDurationMs === undefined) return;
  if (scope.used.durationMs <= scope.spec.maxDurationMs) return;
  const err = new BudgetExceededError({
    kind: 'duration',
    limit: scope.spec.maxDurationMs,
    observed: scope.used.durationMs,
    scopeId: scope.id,
    partialUsage: { ...scope.used },
    preflight,
  });
  fireExceeded(toContext(scope), err);
  throw err;
}

function bumpDuration(scope: BudgetScope): void {
  scope.used.durationMs = Date.now() - scope.startedAt;
}

function fireWarnings(scope: BudgetScope): void {
  const warn = scope.spec.warnAt;
  if (!warn) return;
  if (warn.usd !== undefined && scope.used.usd >= warn.usd && !scope.firedWarnings.has('usd')) {
    scope.firedWarnings.add('usd');
    emit(`Budget warning (scope ${scope.id}): usd >= ${warn.usd} (used ${scope.used.usd}).`);
    fireWarning(toContext(scope), 'usd', scope.used.usd, warn.usd);
  }
  if (
    warn.tokens !== undefined &&
    scope.used.tokens >= warn.tokens &&
    !scope.firedWarnings.has('tokens')
  ) {
    scope.firedWarnings.add('tokens');
    emit(
      `Budget warning (scope ${scope.id}): tokens >= ${warn.tokens} (used ${scope.used.tokens}).`,
    );
    fireWarning(toContext(scope), 'tokens', scope.used.tokens, warn.tokens);
  }
  if (warn.pctOfMax !== undefined) {
    checkPct(scope, 'usd', scope.spec.maxUsd, scope.used.usd, warn.pctOfMax);
    checkPct(scope, 'tokens', scope.spec.maxTokens, scope.used.tokens, warn.pctOfMax);
    checkPct(scope, 'llmCalls', scope.spec.maxLlmCalls, scope.used.llmCalls, warn.pctOfMax);
  }
}

function checkPct(
  scope: BudgetScope,
  kind: string,
  max: number | undefined,
  observed: number,
  pct: number,
): void {
  if (max === undefined || max === 0) return;
  const ratio = (observed / max) * 100;
  const key = `pct:${kind}`;
  if (ratio >= pct && !scope.firedWarnings.has(key)) {
    scope.firedWarnings.add(key);
    emit(
      `Budget warning (scope ${scope.id}): ${kind} at ${ratio.toFixed(1)}% of max (${observed}/${max}).`,
    );
    fireWarning(toContext(scope), `pct:${kind}`, ratio, pct);
  }
}

function emit(message: string): void {
  // Use process.emitWarning when available (Node) so tracing layers can
  // listen via `process.on('warning', ...)`. Fall back to console.warn for
  // Edge / browser-ish runtimes.
  const proc = (globalThis as { process?: { emitWarning?: (m: string, n: string) => void } })
    .process;
  if (proc?.emitWarning) {
    proc.emitWarning(message, 'ZiroBudgetWarning');
  } else {
    console.warn(message);
  }
}
