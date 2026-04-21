import {
  type ApprovalDecision,
  type ApprovalRequest,
  type Approver,
  BudgetExceededError,
  type BudgetSpec,
  fireApprovalRequested,
  fireApprovalResolved,
  intersectSpecs,
  type PendingApproval,
  type ToolCallPart,
  withBudget,
} from '@ziro-agent/core';
import { parseAsync } from 'zod';
import type { Tool } from './define-tool.js';

/** Context passed to {@link RepairToolCall} (v0.6 / RFC 0015). */
export type RepairToolCallContext = {
  toolName: string;
  toolCallId: string;
  step?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Optional hook when Zod input parsing fails for a tool call. Return a
 * repaired {@link ToolCallPart} (same `toolCallId` / `toolName`) to retry
 * parsing once, or `null` to keep the original error behaviour.
 */
export type RepairToolCall = (
  call: ToolCallPart,
  error: unknown,
  ctx: RepairToolCallContext,
) => ToolCallPart | null | Promise<ToolCallPart | null>;

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  /** Either the resolved tool output or the error thrown. */
  result: unknown;
  isError: boolean;
  /** Wall-clock duration of `execute()` in milliseconds. */
  durationMs: number;
  /**
   * The Zod-validated input the tool actually received (or would have
   * received in the `reject` / `pendingApproval` paths). Captured so a
   * downstream `AgentSnapshot` can faithfully reconstruct the original
   * `ToolCallPart.args` on resume — without this, `seedFromSnapshot`
   * loses argument context for `resolvedSiblings`.
   *
   * Optional for backwards compatibility: callers / serialised v1
   * snapshots that lack the field continue to work (resume falls back
   * to `undefined`, matching pre-v0.1.9 behaviour).
   *
   * Added in v0.1.9 alongside `AgentSnapshot.version: 2` per
   * RFC 0004 §v0.1.9 trust-recovery and RFC 0002 amend.
   */
  parsedArgs?: unknown;
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
  /**
   * Set when the tool's `requiresApproval` gate fired and either no
   * `approver` was supplied or the approver returned `{decision: 'suspend'}`.
   * `tool.execute()` was NOT called. The agent loop is expected to
   * capture state into an `AgentSnapshot` and throw `AgentSuspendedError`.
   *
   * `result` is `null` and `isError` is `false` when this is set.
   *
   * Available since v0.1.7 — see RFC 0002.
   */
  pendingApproval?: PendingApproval;
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
  /**
   * Resolves `tool.requiresApproval` gates. When a tool needs approval
   * and this is supplied, the approver decides; when missing, the tool
   * call short-circuits with `pendingApproval` so the agent layer can
   * suspend. See RFC 0002.
   *
   * Available since v0.1.7.
   */
  approver?: Approver;
  /**
   * Read-only context surfaced to the approver alongside the tool input.
   * The agent layer populates this with conversation history and step
   * number; for direct `executeToolCalls` callers it can stay undefined.
   */
  approvalContext?: { step: number; messages: ReadonlyArray<unknown> };
  /**
   * When tool argument parsing fails, invoked once with the parse error.
   * Return a repaired call to retry validation, or `null` to surface the error.
   *
   * @see {@link RepairToolCall}
   */
  repairToolCall?: RepairToolCall;
  /** Agent step index for repair / approval context (optional for direct callers). */
  step?: number;
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
  const {
    toolCalls,
    tools,
    strict = true,
    abortSignal,
    metadata,
    toolBudget,
    approver,
    approvalContext,
    repairToolCall,
    step,
  } = options;

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

    let workingCall: ToolCallPart = call;
    let parsedInput: unknown;
    for (let parseAttempt = 0; parseAttempt < 2; parseAttempt++) {
      try {
        parsedInput = await parseAsync(tool.input, workingCall.args);
        break;
      } catch (err) {
        if (parseAttempt === 0 && repairToolCall) {
          const repaired = await Promise.resolve(
            repairToolCall(workingCall, err, {
              toolName: call.toolName,
              toolCallId: call.toolCallId,
              ...(step !== undefined ? { step } : {}),
              ...(metadata !== undefined ? { metadata } : {}),
            }),
          );
          if (repaired !== null && repaired !== undefined) {
            workingCall = repaired;
            continue;
          }
        }
        return {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: serializeError(err),
          isError: true,
          durationMs: performance.now() - start,
          parsedArgs: workingCall.args,
        };
      }
    }

    // Approval gate (RFC 0002). Evaluated AFTER input parsing so the
    // function form gets the validated input, BEFORE budget+execute so a
    // rejected/suspended call costs nothing.
    let approvedInput = parsedInput;
    const gateActive = await evaluateGate(tool, parsedInput, call.toolCallId, metadata);
    if (gateActive) {
      const req: ApprovalRequest = {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        ...(tool.description !== undefined ? { toolDescription: tool.description } : {}),
        input: parsedInput,
        rawArgs: workingCall.args,
        context: {
          step: approvalContext?.step ?? 0,
          messages: approvalContext?.messages ?? [],
          ...(metadata ? { metadata } : {}),
        },
      };
      fireApprovalRequested(req);

      // No approver → short-circuit with pendingApproval so the agent
      // layer can capture state and suspend.
      if (!approver) {
        const pending: PendingApproval = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          ...(tool.description !== undefined ? { toolDescription: tool.description } : {}),
          parsedInput,
          rawArgs: workingCall.args,
        };
        fireApprovalResolved(req, { decision: 'suspend' });
        return {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: null,
          isError: false,
          durationMs: performance.now() - start,
          parsedArgs: parsedInput,
          pendingApproval: pending,
        };
      }

      let decision: ApprovalDecision;
      try {
        decision = await Promise.resolve(approver(req));
      } catch (err) {
        // Approver itself crashed — surface as a tool error so the agent
        // can recover; do NOT throw out of `executeToolCalls`.
        return {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: serializeError(err),
          isError: true,
          durationMs: performance.now() - start,
          parsedArgs: parsedInput,
        };
      }
      fireApprovalResolved(req, decision);

      if (decision.decision === 'reject') {
        return {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: {
            name: 'ApprovalRejected',
            message: decision.reason ?? `Tool "${call.toolName}" rejected by approver.`,
          },
          isError: true,
          durationMs: performance.now() - start,
          parsedArgs: parsedInput,
        };
      }
      if (decision.decision === 'suspend') {
        const pending: PendingApproval = {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          ...(tool.description !== undefined ? { toolDescription: tool.description } : {}),
          parsedInput,
          rawArgs: workingCall.args,
        };
        return {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: null,
          isError: false,
          durationMs: performance.now() - start,
          parsedArgs: parsedInput,
          pendingApproval: pending,
        };
      }
      // approve — re-validate any human-supplied modifiedInput so the tool
      // still receives a typed payload at runtime.
      if (decision.modifiedInput !== undefined) {
        try {
          approvedInput = await parseAsync(tool.input, decision.modifiedInput);
        } catch (err) {
          return {
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            result: serializeError(err),
            isError: true,
            durationMs: performance.now() - start,
            parsedArgs: parsedInput,
          };
        }
      }
    }

    const runExecute = async (): Promise<unknown> => {
      const value = await Promise.resolve(
        tool.execute(approvedInput, {
          toolCallId: call.toolCallId,
          ...(abortSignal ? { abortSignal } : {}),
          ...(metadata ? { metadata } : {}),
        }),
      );
      return tool.output ? await parseAsync(tool.output, value) : value;
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
        parsedArgs: approvedInput,
      };
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          result: serializeError(err),
          isError: true,
          durationMs: performance.now() - start,
          parsedArgs: approvedInput,
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
        parsedArgs: approvedInput,
      };
    }
  });

  return Promise.all(tasks);
}

/**
 * Evaluate `tool.requiresApproval` (boolean or function form) for a single
 * tool call. Returns `true` when the gate is active for this invocation,
 * `false` otherwise. Function-form gates that throw are treated as "needs
 * approval" — fail-safe; we'd rather over-prompt than silently bypass.
 */
async function evaluateGate(
  tool: Tool,
  parsedInput: unknown,
  toolCallId: string,
  metadata: Record<string, unknown> | undefined,
): Promise<boolean> {
  const ra = tool.requiresApproval;
  if (ra === undefined || ra === false) return false;
  if (ra === true) return true;
  try {
    const ctx: { toolCallId: string; metadata?: Record<string, unknown> } = { toolCallId };
    if (metadata) ctx.metadata = metadata;
    return Boolean(await Promise.resolve(ra(parsedInput, ctx)));
  } catch {
    return true;
  }
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
