import type { Grader, GraderResult } from '../types.js';

export interface CostBudgetOptions {
  maxUsd?: number;
  maxTokens?: number;
  maxLlmCalls?: number;
}

/**
 * Pass when the run's recorded `BudgetUsage` stays under all configured caps.
 * Reads from `ctx.budgetUsage`, which `runEval` populates from the per-case
 * `withBudget` scope. Returns 0 (failed) and a clear reason when no usage was
 * captured (most often because the case threw before any LLM call).
 */
export function costBudget(opts: CostBudgetOptions): Grader<unknown, unknown, unknown> {
  const { maxUsd, maxTokens, maxLlmCalls } = opts;
  if (maxUsd === undefined && maxTokens === undefined && maxLlmCalls === undefined) {
    throw new Error('costBudget: at least one of maxUsd, maxTokens, maxLlmCalls must be set');
  }
  return {
    name: 'costBudget',
    grade(_input, _output, ctx): GraderResult {
      const u = ctx.budgetUsage;
      if (!u) {
        return {
          score: 0,
          passed: false,
          reason: 'no budget usage was captured for this case',
        };
      }
      const violations: string[] = [];
      if (maxUsd !== undefined && u.usd > maxUsd) {
        violations.push(`usd ${u.usd.toFixed(4)} > ${maxUsd}`);
      }
      if (maxTokens !== undefined && u.tokens > maxTokens) {
        violations.push(`tokens ${u.tokens} > ${maxTokens}`);
      }
      if (maxLlmCalls !== undefined && u.llmCalls > maxLlmCalls) {
        violations.push(`llmCalls ${u.llmCalls} > ${maxLlmCalls}`);
      }
      const passed = violations.length === 0;
      return {
        score: passed ? 1 : 0,
        passed,
        reason: passed
          ? `under budget (usd=${u.usd.toFixed(4)}, tokens=${u.tokens}, calls=${u.llmCalls})`
          : `over budget — ${violations.join(', ')}`,
        details: { usage: { ...u } },
      };
    },
  };
}
