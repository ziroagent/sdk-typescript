/**
 * Human-in-the-loop primitives — see RFC 0002.
 *
 * These types live in `@ziro-agent/core` so both `@ziro-agent/tools`
 * (which evaluates `requiresApproval` per tool call) and
 * `@ziro-agent/agent` (which orchestrates suspend/resume) can reference
 * them without taking a dependency on each other.
 *
 * Like Budget Guard, HITL is opt-in: tools that don't declare
 * `requiresApproval` and runs that don't pass an `approver` keep the
 * pre-HITL behaviour with zero overhead.
 */

import type { BudgetSpec, BudgetUsage } from '../budget/types.js';

/**
 * Read-only snapshot of the loop state at the moment a tool call is
 * paused for approval. Surfaced to the user-supplied `Approver` so the
 * decision can take into account *why* the model wanted to call the tool
 * (full conversation, step number, free-form metadata).
 *
 * `messages` is typed as `unknown[]` here to keep `core/hitl` independent
 * of the chat-message shape; agents/tools cast it to `ChatMessage[]`.
 */
export interface ApprovalContext {
  /** 1-indexed agent step where the tool call originated. */
  step: number;
  /** Full conversation up to (but not including) the pending tool result. */
  messages: ReadonlyArray<unknown>;
  /** Free-form tags propagated via `executeToolCalls({ metadata })`. */
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  toolDescription?: string;
  /** Already-validated input — what the tool would actually receive. */
  input: unknown;
  /** Raw arguments the model emitted, before Zod parsing. */
  rawArgs: unknown;
  context: ApprovalContext;
}

/**
 * The three exit shapes of an `Approver`:
 *   - `approve` — `tool.execute()` runs. `modifiedInput` (when present) is
 *     re-validated through the tool's Zod schema before invocation, so a
 *     human can correct a hallucinated argument and still get a typed
 *     payload at runtime.
 *   - `reject` — `tool.execute()` is **not** called. The tool result becomes
 *     `{ isError: true, result: { name: 'ApprovalRejected', message: reason }}`
 *     and the loop continues with that as the model's next tool message.
 *   - `suspend` — `tool.execute()` is **not** called. The agent layer
 *     captures full state into an `AgentSnapshot` and throws
 *     `AgentSuspendedError`. The caller persists the snapshot and later
 *     calls `agent.resume(snapshot, { decisions })`.
 */
export type ApprovalDecision =
  | { decision: 'approve'; modifiedInput?: unknown }
  | { decision: 'reject'; reason?: string }
  | { decision: 'suspend' };

/**
 * Caller-supplied callback that resolves an approval request. May be
 * synchronous or asynchronous — the agent loop awaits the result.
 *
 * Errors thrown by the approver are NOT swallowed; they propagate out of
 * `agent.run` so the caller can distinguish "approver crashed" from
 * "approver said reject".
 */
export type Approver = (req: ApprovalRequest) => ApprovalDecision | Promise<ApprovalDecision>;

/**
 * Static/dynamic gate declared on a tool. The function form receives the
 * already-validated input and may consult external state (feature flag,
 * user role) to decide whether *this specific call* needs approval.
 *
 * `false` (or omitted) is the default — zero overhead, no approver
 * consulted.
 */
export type RequiresApproval<TInput = unknown> =
  | boolean
  | ((
      input: TInput,
      ctx: { toolCallId: string; metadata?: Record<string, unknown> },
    ) => boolean | Promise<boolean>);

/**
 * Placeholder shape the agent layer's `AgentSnapshot` wraps. Defined here
 * (without import-cycle risk) so users writing custom storage adapters can
 * type their persistence layer against `core` without pulling in `agent`.
 */
export interface SerializableBudgetSpec extends Omit<BudgetSpec, 'onExceed' | 'warnAt'> {
  onExceed?: 'throw' | 'truncate';
  warnAt?: { usd?: number; tokens?: number; pctOfMax?: number };
}

export interface PendingApproval {
  toolCallId: string;
  toolName: string;
  toolDescription?: string;
  /** Zod-validated input. */
  parsedInput: unknown;
  /** Raw model output, kept so the resume code can re-parse if the tool's
   *  schema has evolved between suspension and resume. */
  rawArgs: unknown;
}

/**
 * Forward-declared because `@ziro-agent/agent` ships the full
 * `AgentSnapshot`. We keep a minimal shape in core so storage-adapter
 * authors can reference it without an `agent` dependency.
 *
 * The full shape (with `messages`, `steps`, `totalUsage`) is layered on
 * by `@ziro-agent/agent`; this is intentionally a *subset*.
 */
export interface CoreAgentSnapshotFields {
  version: 1;
  agentId?: string;
  createdAt: string;
  scopeId?: string;
  step: number;
  budgetUsage?: BudgetUsage;
  budgetSpec?: SerializableBudgetSpec;
  pendingApprovals: PendingApproval[];
}
