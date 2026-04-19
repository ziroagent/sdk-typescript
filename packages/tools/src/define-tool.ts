import type { BudgetSpec } from '@ziro-agent/core';
import type { z } from 'zod';

export interface ToolExecutionContext {
  /** Stable id of this specific tool invocation. */
  toolCallId: string;
  /** AbortSignal propagated from the agent / generateText call. */
  abortSignal?: AbortSignal;
  /** Free-form metadata the agent layer may attach (session id, user, etc.). */
  metadata?: Record<string, unknown>;
}

export interface Tool<TInput = unknown, TOutput = unknown> {
  readonly __ziro_tool__: true;
  readonly name: string;
  readonly description?: string;
  /** Zod schema for the tool input — the single source of truth. */
  readonly input: z.ZodType<TInput>;
  /** Optional output schema (used for runtime validation of execute()'s return). */
  readonly output?: z.ZodType<TOutput>;
  /**
   * Per-invocation budget for this tool. When set, every call to `execute()`
   * runs inside its own `withBudget` scope intersected with the surrounding
   * agent / `executeToolCalls` budget — see RFC 0001 §"How budgets compose".
   *
   * If the budget is exceeded BEFORE the tool's first LLM call (or before
   * any LLM call at all in the case of a non-LLM tool), `executeToolCalls`
   * surfaces the resulting `BudgetExceededError` as a tool result with
   * `isError: true`, so the agent loop sees a failed step rather than a
   * crashed run. The agent loop's own budget then decides whether to keep
   * iterating or terminate.
   */
  readonly budget?: BudgetSpec;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput> | TOutput;
}

export interface DefineToolOptions<TInput, TOutput> {
  name: string;
  description?: string;
  input: z.ZodType<TInput>;
  output?: z.ZodType<TOutput>;
  /** See {@link Tool.budget}. */
  budget?: BudgetSpec;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput> | TOutput;
}

/**
 * Define a type-safe tool. The Zod `input` schema drives both runtime
 * validation (in `executeToolCalls`) and the JSON schema sent to the model.
 */
export function defineTool<TInput, TOutput>(
  options: DefineToolOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return {
    __ziro_tool__: true,
    name: options.name,
    ...(options.description !== undefined ? { description: options.description } : {}),
    input: options.input,
    ...(options.output !== undefined ? { output: options.output } : {}),
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
    execute: options.execute,
  } as Tool<TInput, TOutput>;
}

export function isTool(value: unknown): value is Tool {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __ziro_tool__?: boolean }).__ziro_tool__ === true
  );
}
