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
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput> | TOutput;
}

export interface DefineToolOptions<TInput, TOutput> {
  name: string;
  description?: string;
  input: z.ZodType<TInput>;
  output?: z.ZodType<TOutput>;
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
