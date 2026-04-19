import type { TokenUsage } from '@ziroagent/core';
import type { AgentStep } from './types.js';

export interface StopWhenContext {
  steps: AgentStep[];
  totalUsage: TokenUsage;
}

/** Predicate evaluated after every step; return true to stop the agent. */
export type StopWhen = (ctx: StopWhenContext) => boolean | Promise<boolean>;

/** Stop after `n` total steps. */
export const stepCountIs =
  (n: number): StopWhen =>
  ({ steps }) =>
    steps.length >= n;

/** Stop when total token usage exceeds the given threshold. */
export const totalTokensExceeds =
  (max: number): StopWhen =>
  ({ totalUsage }) =>
    (totalUsage.totalTokens ?? 0) >= max;

/** Combine multiple stop conditions with OR. */
export const anyOf =
  (...conds: StopWhen[]): StopWhen =>
  async (ctx) => {
    for (const c of conds) {
      if (await c(ctx)) return true;
    }
    return false;
  };
