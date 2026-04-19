import type { ToolCallPart } from '@ziro-ai/core';
import type { Tool } from './define-tool.js';

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  /** Either the resolved tool output or the error thrown. */
  result: unknown;
  isError: boolean;
  /** Wall-clock duration of `execute()` in milliseconds. */
  durationMs: number;
}

interface ExecuteOptions {
  toolCalls: ToolCallPart[];
  tools: Record<string, Tool>;
  /** When true (default), unknown tools fail-fast; otherwise they're skipped. */
  strict?: boolean;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

/**
 * Run a batch of tool calls in parallel. Each result includes timing and an
 * `isError` flag; the agent loop is expected to feed these back to the model
 * as `tool` messages.
 */
export async function executeToolCalls(options: ExecuteOptions): Promise<ToolExecutionResult[]> {
  const { toolCalls, tools, strict = true, abortSignal, metadata } = options;

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

    try {
      const value = await Promise.resolve(
        tool.execute(parsedInput, {
          toolCallId: call.toolCallId,
          ...(abortSignal ? { abortSignal } : {}),
          ...(metadata ? { metadata } : {}),
        }),
      );
      const validated = tool.output ? tool.output.parse(value) : value;
      return {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        result: validated,
        isError: false,
        durationMs: performance.now() - start,
      };
    } catch (err) {
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

function serializeError(err: unknown): { message: string; name?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { message: String(err) };
}
