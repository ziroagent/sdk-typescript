import type {
  ApprovalDecision,
  Approver,
  BudgetSpec,
  BudgetUsage,
  ChatMessage,
  PendingApproval,
  SerializableBudgetSpec,
  TokenUsage,
} from '@ziro-agent/core';
import type { ToolExecutionResult } from '@ziro-agent/tools';
import type { StopWhen } from './stop-when.js';
import type { AgentFinishReason, AgentStep, StepEventListener } from './types.js';

/**
 * JSON-serializable snapshot of an agent run that suspended waiting for
 * human approval. See RFC 0002. Persist this with whatever store fits
 * (Redis, Postgres, S3, in-memory) and feed it back into `agent.resume`.
 *
 * Backwards compatibility: `version` is bumped any time the shape changes
 * in a non-additive way; resume code branches on it.
 */
export interface AgentSnapshot {
  readonly version: 1;
  /** True for any object created by `AgentSuspendedError` — cross-realm safe. */
  readonly __ziro_snapshot__: true;
  /** Caller-supplied stable id (echoed back through `resume`). */
  agentId?: string;
  createdAt: string;
  /** Budget scope id at the moment of suspension, if a budget was active. */
  scopeId?: string;
  /** 1-indexed step where the suspension happened. */
  step: number;
  /** Conversation up to (but not including) the pending tool result. */
  messages: ChatMessage[];
  /** Steps already completed before suspension. */
  steps: AgentStep[];
  totalUsage: TokenUsage;
  /**
   * Budget usage accumulated before suspension. Carried into the resumed
   * scope via `withBudget`'s `presetUsage` so a multi-day pause cannot
   * silently bypass `maxUsd`.
   */
  budgetUsage?: BudgetUsage;
  /**
   * Snapshot of the user's `BudgetSpec` minus non-serializable fields
   * (function-form `onExceed`). The caller may re-supply a fresh
   * `BudgetSpec` to `resume` — the spec on the snapshot is a fallback.
   */
  budgetSpec?: SerializableBudgetSpec;
  /** All tool calls in the suspended batch awaiting approval. */
  pendingApprovals: PendingApproval[];
  /**
   * Tool calls in the same batch that already executed (approval not
   * required, or approver returned `approve`) before suspension was
   * triggered for a sibling. Their `tool.execute()` side-effects are
   * already applied; on resume their results are combined with the
   * post-approval results to form the single tool message appended to
   * the conversation.
   *
   * Empty when the entire batch was pending.
   */
  resolvedSiblings: ToolExecutionResult[];
}

/**
 * Thrown from `agent.run` when a tool call's `requiresApproval` gate
 * fires and either no `approver` was supplied or the approver returned
 * `{ decision: 'suspend' }`.
 *
 * The caller persists `error.snapshot` (it is JSON-serializable) and
 * later calls `agent.resume(snapshot, { decisions })` to continue.
 */
export class AgentSuspendedError extends Error {
  override readonly name = 'AgentSuspendedError';
  readonly snapshot: AgentSnapshot;
  /** Cross-realm-safe brand — survives `JSON.parse(JSON.stringify(err))` when re-thrown. */
  readonly __ziro_suspended__: true = true;
  constructor(args: { snapshot: AgentSnapshot; message?: string }) {
    super(
      args.message ??
        `Agent suspended for human approval (step ${args.snapshot.step}, ` +
          `${args.snapshot.pendingApprovals.length} pending tool ` +
          `call${args.snapshot.pendingApprovals.length === 1 ? '' : 's'}).`,
    );
    this.snapshot = args.snapshot;
  }
}

/** Type-guard usable across realms (does not depend on `instanceof`). */
export function isAgentSuspendedError(value: unknown): value is AgentSuspendedError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __ziro_suspended__?: boolean }).__ziro_suspended__ === true
  );
}

export interface AgentResumeOptions {
  /**
   * Decision for every tool call in `snapshot.pendingApprovals`. Missing
   * entries default to `{ decision: 'suspend' }` — the loop will re-emit
   * an `AgentSuspendedError` carrying an updated snapshot.
   */
  decisions: Record<string, ApprovalDecision>;
  /**
   * Re-supply (or replace) the budget. When omitted the resume reuses the
   * snapshot's `budgetSpec`. Original `budgetUsage` carries forward via
   * `withBudget(presetUsage)` regardless of which spec is used.
   */
  budget?: BudgetSpec;
  /** Default budget for tool calls during the resumed run. */
  toolBudget?: BudgetSpec;
  /** Approver for any FURTHER approvals that come up after resume. */
  approver?: Approver;
  abortSignal?: AbortSignal;
  onEvent?: StepEventListener;
  /** Step-cap override (otherwise inherited from `CreateAgentOptions`). */
  maxSteps?: number;
  /** stopWhen override (otherwise inherited). */
  stopWhen?: StopWhen;
  /**
   * Free-form metadata propagated to the approver and tool-execute ctx
   * during the resumed run.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Attribute-only summary of how a resume turned out — useful for
 * tracing / OTel observers and for callers who want a one-line status.
 */
export interface ResumeSummary {
  decisionCounts: { approve: number; reject: number; suspend: number };
  finishReason: AgentFinishReason;
  stepsAdded: number;
}
