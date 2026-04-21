import type { BudgetContext, BudgetExceededError, BudgetObserver } from '@ziro-agent/core';
import { setBudgetObserver } from '@ziro-agent/core';
import { ATTR, type AttrValue } from './attributes.js';
import { getTracer, type SpanLike } from './tracer.js';

/**
 * Bridge `@ziro-agent/core`'s budget lifecycle into OpenTelemetry spans /
 * events. Call once at process startup AFTER `setTracer(...)` so the active
 * tracer is the OTel-backed one — see RFC 0001 §Observability for the event
 * catalogue.
 *
 * Each `withBudget` opens one span (`ziro.budget.scope`) that lives for the
 * duration of the scope; usage updates and warnings are attached as span
 * events on that span. A `BudgetExceededError` is recorded as an exception
 * with status=ERROR before the span ends.
 *
 * Returns an `unregister()` callback (and the previously-installed observer)
 * so a host process can swap instrumentations cleanly — useful in tests.
 */
export function instrumentBudget(): {
  unregister: () => void;
  previous: BudgetObserver | null;
} {
  // Each scope ID -> the open span. We can't pass the span through the
  // observer API (it would force `core` to know about OTel), so we keep a
  // small process-local map and key it by `scopeId`. The map is bounded by
  // the number of concurrently-open scopes, which is tiny in practice.
  const openSpans = new Map<string, SpanLike>();

  const observer: BudgetObserver = {
    onScopeStart(ctx: BudgetContext) {
      const tracer = getTracer();
      const span = tracer.startSpan('ziro.budget.scope', {
        kind: 'internal',
        attributes: scopeStartAttrs(ctx),
      });
      openSpans.set(ctx.scopeId, span);
    },

    onScopeEnd(ctx: BudgetContext, outcome: 'ok' | 'error') {
      const span = openSpans.get(ctx.scopeId);
      if (!span) return;
      openSpans.delete(ctx.scopeId);
      span.setAttributes({
        ...usageAttrs(ctx),
        [ATTR.BudgetScopeOutcome]: outcome,
      });
      span.setStatus({ code: outcome === 'ok' ? 1 : 2 });
      span.end();
    },

    onUsageUpdate(ctx: BudgetContext) {
      const span = openSpans.get(ctx.scopeId);
      if (!span) return;
      span.addEvent('ziro.budget.usage.update', usageAttrs(ctx));
    },

    onWarning(ctx: BudgetContext, kind: string, observed: number, threshold: number) {
      const span = openSpans.get(ctx.scopeId);
      if (!span) return;
      span.addEvent('ziro.budget.warning', {
        [ATTR.BudgetWarningKind]: kind,
        [ATTR.BudgetWarningObserved]: observed,
        [ATTR.BudgetWarningThreshold]: threshold,
      });
    },

    onExceeded(ctx: BudgetContext, error: BudgetExceededError) {
      const span = openSpans.get(ctx.scopeId);
      if (!span) return;
      span.addEvent('ziro.budget.exceeded', {
        [ATTR.BudgetExceededKind]: error.kind,
        [ATTR.BudgetExceededLimit]: error.limit,
        [ATTR.BudgetExceededObserved]: error.observed,
      });
      span.recordException(error);
      // We do NOT end the span here — `onScopeEnd` will fire next as the
      // throw unwinds out of `withBudget` and own the lifecycle close.
    },
  };

  const previous = setBudgetObserver(observer);

  return {
    previous,
    unregister: () => {
      // Restore the previous observer (or `null`) so calling code can chain.
      setBudgetObserver(previous);
      // Best-effort: end any spans we still own. In a normal program flow
      // this is empty; in tests where `unregister` runs mid-scope it makes
      // sure we don't leak open spans into the tracer.
      for (const span of openSpans.values()) {
        span.setAttributes({ [ATTR.BudgetScopeOutcome]: 'unregistered' });
        span.end();
      }
      openSpans.clear();
    },
  };
}

function scopeStartAttrs(ctx: BudgetContext): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {
    [ATTR.BudgetScopeId]: ctx.scopeId,
  };
  const s = ctx.spec;
  if (s.maxUsd !== undefined) out[ATTR.BudgetSpecMaxUsd] = s.maxUsd;
  if (s.maxTokens !== undefined) out[ATTR.BudgetSpecMaxTokens] = s.maxTokens;
  if (s.maxLlmCalls !== undefined) out[ATTR.BudgetSpecMaxLlmCalls] = s.maxLlmCalls;
  if (s.maxSteps !== undefined) out[ATTR.BudgetSpecMaxSteps] = s.maxSteps;
  if (s.maxDurationMs !== undefined) out[ATTR.BudgetSpecMaxDurationMs] = s.maxDurationMs;
  if (s.tenantId !== undefined) out[ATTR.BudgetTenantId] = s.tenantId;
  if (s.hard === true) out[ATTR.BudgetSpecHard] = true;
  return out;
}

function usageAttrs(ctx: BudgetContext): Record<string, AttrValue> {
  return {
    [ATTR.BudgetUsedUsd]: ctx.used.usd,
    [ATTR.BudgetUsedTokens]: ctx.used.tokens,
    [ATTR.BudgetUsedLlmCalls]: ctx.used.llmCalls,
    [ATTR.BudgetUsedDurationMs]: ctx.used.durationMs,
  };
}
