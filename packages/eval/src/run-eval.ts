import { AgentSuspendedError } from '@ziro-agent/agent';
import {
  type BudgetSpec,
  type BudgetUsage,
  getCurrentBudget,
  intersectSpecs,
  withBudget,
} from '@ziro-agent/core';
import { defaultGate, evaluateGate } from './gate.js';
import type {
  CaseGraderEntry,
  CaseRunError,
  EvalCase,
  EvalCaseResult,
  EvalRun,
  EvalRunSummary,
  EvalSpec,
  Grader,
  GraderResult,
  RunContext,
  RunEvalOptions,
  SerializableErrorInfo,
} from './types.js';

/**
 * Identity passthrough so users can write `defineEval({...})` and benefit
 * from contextual type inference (much like `defineConfig` in tsup/vitest).
 */
export function defineEval<TInput, TOutput, TExpected>(
  spec: EvalSpec<TInput, TOutput, TExpected>,
): EvalSpec<TInput, TOutput, TExpected> {
  return spec;
}

/**
 * Execute an `EvalSpec` over its dataset. See RFC 0003 for design.
 *
 * Per-case lifecycle:
 *   1. Build per-case AbortController honouring caller signal + timeoutMs.
 *   2. Compute effective budget = intersect(spec.budget, case.budget).
 *   3. Open `withBudget(budget, ...)` and call `spec.run(input, ctx)`.
 *   4. On AgentSuspendedError → record snapshot under `agentSnapshot`.
 *   5. Snapshot `getCurrentBudget()` into `budgetUsage` before exiting scope.
 *   6. Run every grader; aggregate weighted mean; compute `passed`.
 */
export async function runEval<TInput, TOutput, TExpected>(
  spec: EvalSpec<TInput, TOutput, TExpected>,
  options: RunEvalOptions = {},
): Promise<EvalRun<TInput, TOutput, TExpected>> {
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const startedAt = new Date();

  const cases = spec.dataset.map((c, i) => normalizeCase(c, i));
  const queue: Array<EvalCase<TInput, TExpected>> = cases.slice();
  const results: Array<EvalCaseResult<TInput, TOutput, TExpected>> = new Array(cases.length);

  // Each case knows its position via the original dataset index, captured
  // in `metadata.__index__` by `normalizeCase`. We index into `results`
  // using that so ordering is preserved regardless of completion order.
  const indexOf = new Map<EvalCase<TInput, TExpected>, number>();
  for (let i = 0; i < cases.length; i++) {
    indexOf.set(cases[i] as EvalCase<TInput, TExpected>, i);
  }

  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, queue.length); w++) {
    workers.push(workerLoop());
  }
  await Promise.all(workers);

  async function workerLoop(): Promise<void> {
    while (queue.length > 0) {
      if (options.abortSignal?.aborted) return;
      const next = queue.shift();
      if (!next) return;
      const idx = indexOf.get(next);
      if (idx === undefined) continue;
      const result = await runOneCase(spec, next, options);
      results[idx] = result;
      try {
        options.onCaseFinish?.(result as EvalCaseResult);
      } catch {
        // Reporter errors must never break the runner.
      }
    }
  }

  const finishedAt = new Date();
  const summary = summarize(results);
  const gate = options.gate ?? spec.gate ?? defaultGate();
  const baseSpec: EvalRun<TInput, TOutput, TExpected>['spec'] = { name: spec.name, gate };
  if (spec.description !== undefined) baseSpec.description = spec.description;
  const run: EvalRun<TInput, TOutput, TExpected> = {
    spec: baseSpec,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    cases: results,
    summary,
    gate: { passed: false, reason: '' },
  };
  run.gate = evaluateGate(run as EvalRun, gate);
  return run;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function normalizeCase<TInput, TExpected>(
  c: EvalCase<TInput, TExpected>,
  index: number,
): EvalCase<TInput, TExpected> {
  const id = c.id ?? `case-${index}`;
  const out: EvalCase<TInput, TExpected> = {
    ...c,
    id,
    name: c.name ?? id,
  };
  return out;
}

async function runOneCase<TInput, TOutput, TExpected>(
  spec: EvalSpec<TInput, TOutput, TExpected>,
  evalCase: EvalCase<TInput, TExpected>,
  options: RunEvalOptions,
): Promise<EvalCaseResult<TInput, TOutput, TExpected>> {
  const timeoutMs = evalCase.timeoutMs ?? spec.timeoutMs;
  const controller = new AbortController();
  const cleanup: Array<() => void> = [];

  if (options.abortSignal) {
    if (options.abortSignal.aborted) {
      controller.abort(options.abortSignal.reason);
    } else {
      const onAbort = () => controller.abort(options.abortSignal?.reason);
      options.abortSignal.addEventListener('abort', onAbort, { once: true });
      cleanup.push(() => options.abortSignal?.removeEventListener('abort', onAbort));
    }
  }

  let timedOut = false;
  if (timeoutMs !== undefined) {
    const t = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`case "${evalCase.id}" timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    cleanup.push(() => clearTimeout(t));
  }

  const ctx: RunContext = {
    caseId: evalCase.id ?? '?',
    caseName: evalCase.name ?? evalCase.id ?? '?',
    abortSignal: controller.signal,
    metadata: evalCase.metadata ?? {},
  };

  const effectiveBudget: BudgetSpec | undefined = intersectIfBoth(spec.budget, evalCase.budget);
  const t0 = Date.now();
  let output: TOutput | undefined;
  let error: CaseRunError | undefined;
  let agentSnapshot: EvalCaseResult<TInput, TOutput, TExpected>['agentSnapshot'];
  let budgetUsage: BudgetUsage | undefined;
  let scopeId: string | undefined;

  try {
    if (effectiveBudget) {
      const captured = await withBudget(effectiveBudget, async () => {
        const value = await Promise.resolve(spec.run(evalCase.input, ctx));
        const ctxNow = getCurrentBudget();
        return { value, usage: ctxNow?.used, scopeId: ctxNow?.scopeId } as const;
      });
      output = captured.value;
      if (captured.usage) budgetUsage = { ...captured.usage };
      if (captured.scopeId) scopeId = captured.scopeId;
    } else {
      output = await Promise.resolve(spec.run(evalCase.input, ctx));
    }
  } catch (err) {
    if (err instanceof AgentSuspendedError) {
      error = { name: err.name, message: err.message, kind: 'suspended' };
      agentSnapshot = err.snapshot;
    } else if (timedOut || (err instanceof Error && err.name === 'AbortError')) {
      const e = err as Error;
      error = {
        name: e.name || 'AbortError',
        message: timedOut ? `timed out after ${timeoutMs} ms` : e.message,
        kind: 'timeout',
      };
    } else {
      const e = err as Error;
      error = {
        name: e.name || 'Error',
        message: e.message ?? String(err),
        kind: 'thrown',
      };
    }
  } finally {
    for (const fn of cleanup) fn();
  }

  const durationMs = Date.now() - t0;

  const graderEntries: CaseGraderEntry[] = [];
  for (const grader of spec.graders) {
    const entry = await runGrader(grader, evalCase, output, {
      durationMs,
      ...(budgetUsage !== undefined ? { budgetUsage } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(agentSnapshot !== undefined ? { agentSnapshot } : {}),
    });
    graderEntries.push(entry);
  }

  const meanScore = computeWeightedMean(graderEntries);
  const passed =
    error === undefined &&
    graderEntries.every((e) => !e.contributes || (e.error === undefined && e.result.passed));

  const out: EvalCaseResult<TInput, TOutput, TExpected> = {
    case: evalCase,
    durationMs,
    graders: graderEntries,
    meanScore,
    passed,
  };
  if (output !== undefined) out.output = output;
  if (budgetUsage !== undefined) out.budgetUsage = budgetUsage;
  if (scopeId !== undefined) out.scopeId = scopeId;
  if (error !== undefined) out.error = error;
  if (agentSnapshot !== undefined) out.agentSnapshot = agentSnapshot;
  return out;
}

async function runGrader<TInput, TOutput, TExpected>(
  grader: Grader<TInput, TOutput, TExpected>,
  evalCase: EvalCase<TInput, TExpected>,
  output: TOutput | undefined,
  partialCtx: {
    durationMs: number;
    budgetUsage?: BudgetUsage;
    error?: CaseRunError;
    agentSnapshot?: EvalCaseResult<TInput, TOutput, TExpected>['agentSnapshot'];
  },
): Promise<CaseGraderEntry> {
  const t0 = Date.now();
  const weight = grader.weight ?? 1;
  const contributes = grader.contributes ?? true;
  let result: GraderResult;
  let graderError: SerializableErrorInfo | undefined;
  try {
    const ctx: Parameters<typeof grader.grade>[2] = {
      case: evalCase,
      durationMs: partialCtx.durationMs,
      ...(partialCtx.budgetUsage !== undefined ? { budgetUsage: partialCtx.budgetUsage } : {}),
      ...(partialCtx.error !== undefined ? { error: partialCtx.error } : {}),
      ...(partialCtx.agentSnapshot !== undefined
        ? { agentSnapshot: partialCtx.agentSnapshot }
        : {}),
    };
    const value = await Promise.resolve(grader.grade(evalCase.input, output as TOutput, ctx));
    const score = clamp01(value.score);
    result = {
      score,
      passed: typeof value.passed === 'boolean' ? value.passed : score >= 0.5,
      ...(value.reason !== undefined ? { reason: value.reason } : {}),
      ...(value.details !== undefined ? { details: value.details } : {}),
    };
  } catch (err) {
    const e = err as Error;
    graderError = { name: e.name || 'Error', message: e.message ?? String(err) };
    result = {
      score: 0,
      passed: false,
      reason: `grader threw: ${graderError.message}`,
    };
  }
  const out: CaseGraderEntry = {
    grader: grader.name,
    weight,
    contributes,
    result,
    durationMs: Date.now() - t0,
  };
  if (graderError !== undefined) out.error = graderError;
  return out;
}

function computeWeightedMean(entries: CaseGraderEntry[]): number {
  let totalWeight = 0;
  let totalScore = 0;
  for (const e of entries) {
    if (!e.contributes) continue;
    totalWeight += e.weight;
    totalScore += e.weight * e.result.score;
  }
  return totalWeight === 0 ? 0 : totalScore / totalWeight;
}

function summarize(
  cases: ReadonlyArray<EvalCaseResult<unknown, unknown, unknown>>,
): EvalRunSummary {
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let totalScore = 0;
  let totalCostUsd = 0;
  let totalTokens = 0;
  let anyCost = false;
  let anyTokens = false;
  for (const c of cases) {
    if (c.error) errored += 1;
    if (c.passed) passed += 1;
    else failed += 1;
    totalScore += c.meanScore;
    if (c.budgetUsage) {
      anyCost = true;
      anyTokens = true;
      totalCostUsd += c.budgetUsage.usd;
      totalTokens += c.budgetUsage.tokens;
    }
  }
  const total = cases.length;
  const summary: EvalRunSummary = {
    total,
    passed,
    failed,
    errored,
    meanScore: total === 0 ? 0 : totalScore / total,
  };
  if (anyCost) summary.totalCostUsd = totalCostUsd;
  if (anyTokens) summary.totalTokens = totalTokens;
  return summary;
}

function intersectIfBoth(a?: BudgetSpec, b?: BudgetSpec): BudgetSpec | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return intersectSpecs(a, b);
}

function clamp01(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
