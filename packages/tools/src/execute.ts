import {
  BudgetExceededError,
  type BudgetSpec,
  intersectSpecs,
  type ToolCallPart,
  withBudget,
} from '@ziro-agent/core';
import type { Tool } from './define-tool.js';

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  /** Either the resolved tool output or the error thrown. */
  result: unknown;
  isError: boolean;
  /** Wall-clock duration of `execute()` in milliseconds. */
  durationMs: number;
  /**
   * Set when the tool was terminated by a `BudgetExceededError`. Useful for
   * the agent loop to distinguish a budget halt from an arbitrary runtime
   * error (the former should usually stop the run; the latter may be
   * retryable).
   */
  budgetExceeded?: {
    kind: BudgetExceededError['kind'];
    limit: number;
    observed: number;
    scopeId: string;
  };
}

interface ExecuteOptions {
  toolCalls: ToolCallPart[];
  tools: Record<string, Tool>;
  /** When true (default), unknown tools fail-fast; otherwise they're skipped. */
  strict?: boolean;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
  /**
   * Default budget applied to EACH tool call in this batch — composed
   * (intersected) with the tool's declared `budget` and any surrounding
   * `withBudget` scope. See RFC 0001 §"How budgets compose".
   */
  toolBudget?: BudgetSpec;
}

/**
 * Run a batch of tool calls in parallel. Each result includes timing and an
 * `isError` flag; the agent loop is expected to feed these back to the model
 * as `tool` messages.
 *
 * Budget-aware: a tool's declared `budget` and the batch-level `toolBudget`
 * are wrapped around `tool.execute()` so any nested `generateText` (or other
 * SDK call that consults `getCurrentScope()`) is bounded. A
 * `BudgetExceededError` thrown from inside the tool is captured and surfaced
 * as `{ isError: true, budgetExceeded: { ... } }` rather than re-thrown,
 * matching the behaviour of any other tool failure.
 */
export async function executeToolCalls(options: ExecuteOptions): Promise<ToolExecutionResult[]> {
  const { toolCalls, tools, strict = true, abortSignal, metadata, toolBudget } = options;

  const tasks = toolCalls.map(async (call): Promise<ToolExecutionResult> => {
    const start = performance.now();
    const tool = tools[call.toolName];
    if (!tool) {
      const err = new Error(`Tool "${call.toolName}" was not registered.`);
      if (strict) throw err;
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result: { message: err.message },
        isError: true,
        durationMs: performance.now() - start,
      };
    }

    let parsedInput: unknown;
    try {
      parsedInput = tool.input.parse(call.args);
    } catch (err) {
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result: serializeError(err),
        isError: true,
        durationMs: performance.now() - start,
      };
    }

    const runExecute = async (): Promise<unknown> => {
      const value = await Promise.resolve(
        tool.execute(parsedInput, {
          toolCallId: call.toolCallId,
          ...(abortSignal ? { abortSignal } : {}),
          ...(metadata ? { metadata } : {}),
        }),
      );
      return tool.output ? tool.output.parse(value) : value;
    };

    const composedBudget = composeBudget(toolBudget, tool.budget);

    try {
      const validated = composedBudget
        ? await withBudget(composedBudget, runExecute)
        : await runExecute();
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result: validated,
        isError: false,
        durationMs: performance.now() - start,
      };
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: serializeError(err),
          isError: true,
          durationMs: performance.now() - start,
          budgetExceeded: {
            kind: err.kind,
            limit: err.limit,
            observed: err.observed,
            scopeId: err.scopeId,
          },
        };
      }
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result: serializeError(err),
        isError: true,
        durationMs: performance.now() - start,
      };
    }
  });

  return Promise.all(tasks);
}

/**
 * Intersect a batch-level `toolBudget` with a per-tool declared `budget`.
 * The result is what we open the `withBudget` scope with; the AsyncLocalStorage
 * machinery then intersects again with any surrounding parent scope.
 *
 * Returns `undefined` when neither side specifies anything — in that case we
 * skip opening a scope at all so non-budget tools have zero overhead.
 */
function composeBudget(
  outer: BudgetSpec | undefined,
  inner: BudgetSpec | undefined,
): BudgetSpec | undefined {
  if (!outer && !inner) return undefined;
  if (!outer) return inner;
  if (!inner) return outer;
  return intersectSpecs(outer, inner);
}

function serializeError(err: unknown): { message: string; name?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { message: String(err) };
}
