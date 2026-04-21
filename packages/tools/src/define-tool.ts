import type { BudgetSpec, RequiresApproval } from '@ziro-agent/core';
import type { z } from 'zod';
import { normalizeToolSchema, type ToolSchemaSpec } from './tool-schema.js';

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
  /**
   * Human-in-the-loop gate — see RFC 0002. Boolean form requires approval
   * for every call; function form is consulted with the already-validated
   * input so the gate can depend on data ("only need approval if amount
   * > $100"). When unset/false (default) the tool runs immediately with
   * zero overhead.
   *
   * Evaluated by `executeToolCalls` AFTER input parsing and BEFORE
   * `tool.execute()`. Resolution is delegated to the `approver` callback
   * passed into `executeToolCalls`; if no approver is supplied, the tool
   * call short-circuits with `pendingApproval` set on the result so the
   * agent layer can suspend.
   *
   * Available since v0.1.7.
   *
   * Stored as the un-parameterized `RequiresApproval` (i.e. `<unknown>`)
   * so heterogeneous tool maps (`Record<string, Tool>`) remain assignable
   * — `RequiresApproval<TInput>` is contravariant in `TInput` and would
   * otherwise block widening. The user-facing typed form is preserved on
   * `DefineToolOptions.requiresApproval` below.
   */
  readonly requiresApproval?: RequiresApproval;
  /**
   * When `true`, the tool is treated as mutating external state (writes,
   * deletes, payments, etc.). `defineTool` defaults `requiresApproval` to
   * `true` if you set `mutates: true` and omit `requiresApproval` — v0.5
   * default-deny (see ROADMAP §v0.5 C1). Set `requiresApproval: false` to
   * opt out explicitly (document why in your tool description).
   */
  readonly mutates?: boolean;
  /**
   * Declared capability tags for marketplaces / policy engines (RFC 0013).
   * Example: `['network', 'fs:write:/tmp']`.
   */
  readonly capabilities?: readonly string[];
  /**
   * When set, `instrumentTool()` from `@ziro-agent/tracing` uses this span
   * name instead of `gen_ai.tool.<name>` (e.g. `ziro.sandbox.execute`).
   */
  readonly spanName?: string;
  /** Extra span attributes (string values) for this tool instance. */
  readonly traceAttributes?: Readonly<Record<string, string>>;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput> | TOutput;
}

export interface DefineToolOptions<TInput, TOutput> {
  name: string;
  description?: string;
  input: ToolSchemaSpec<TInput>;
  output?: ToolSchemaSpec<TOutput>;
  /** See {@link Tool.budget}. */
  budget?: BudgetSpec;
  /** See {@link Tool.requiresApproval}. */
  requiresApproval?: RequiresApproval<TInput>;
  /** See {@link Tool.mutates}. */
  mutates?: boolean;
  /** See {@link Tool.capabilities}. */
  capabilities?: readonly string[];
  /** See {@link Tool.spanName}. */
  spanName?: string;
  /** See {@link Tool.traceAttributes}. */
  traceAttributes?: Readonly<Record<string, string>>;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput> | TOutput;
}

/**
 * Define a type-safe tool. The Zod `input` schema drives both runtime
 * validation (in `executeToolCalls`) and the JSON schema sent to the model.
 */
export function defineTool<TInput, TOutput>(
  options: DefineToolOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  const input = normalizeToolSchema(options.input);
  const output = options.output !== undefined ? normalizeToolSchema(options.output) : undefined;
  const mutates = options.mutates;
  const requiresApproval =
    mutates === true && options.requiresApproval === undefined
      ? true
      : (options.requiresApproval as RequiresApproval | undefined);
  return {
    __ziro_tool__: true,
    name: options.name,
    ...(options.description !== undefined ? { description: options.description } : {}),
    input,
    ...(output !== undefined ? { output } : {}),
    ...(options.budget !== undefined ? { budget: options.budget } : {}),
    ...(mutates !== undefined ? { mutates } : {}),
    ...(requiresApproval !== undefined
      ? { requiresApproval: requiresApproval as RequiresApproval }
      : {}),
    ...(options.capabilities !== undefined ? { capabilities: options.capabilities } : {}),
    ...(options.spanName !== undefined ? { spanName: options.spanName } : {}),
    ...(options.traceAttributes !== undefined ? { traceAttributes: options.traceAttributes } : {}),
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
