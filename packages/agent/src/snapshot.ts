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
import type { RepairToolCall, ToolExecutionResult } from '@ziro-agent/tools';
import type { PrepareStep } from './prepare-step.js';
import type { StopWhen } from './stop-when.js';
import type { AgentFinishReason, AgentStep, StepEventListener } from './types.js';

/**
 * Current snapshot shape version. Bumped any time the shape changes in a
 * non-additive way; the SDK accepts older versions transparently via
 * {@link migrateSnapshot}.
 *
 * - **v1** (v0.1.0 → v0.1.8): original shape per RFC 0002.
 * - **v2** (v0.1.9+): `resolvedSiblings[]` items now carry `parsedArgs`
 *   so resume can faithfully reconstruct the original `ToolCallPart.args`
 *   when synthesising the suspended step. Closes the gap reported in
 *   RFC 0004 §v0.1.9 trust-recovery / RFC 0002 amend.
 */
export const CURRENT_SNAPSHOT_VERSION = 2;
export type SnapshotVersion = 1 | 2;

/**
 * JSON-serializable snapshot of an agent run that suspended waiting for
 * human approval. See RFC 0002. Persist this with whatever store fits
 * (Redis, Postgres, S3, in-memory) and feed it back into `agent.resume`.
 *
 * Backwards compatibility: the SDK accepts both v1 and v2 snapshots on
 * `resume()` and runs them through {@link migrateSnapshot} transparently.
 * v1 snapshots persisted before v0.1.9 will keep resuming for the
 * documented 12-month support window (see `apps/docs/content/docs/migration.mdx`).
 */
export interface AgentSnapshot {
  /**
   * Shape version. New snapshots emit `2`; v1 snapshots are migrated
   * on-load. Branches on this when persistence layers need to know
   * which schema to apply (rare — most callers should let
   * `migrateSnapshot()` normalise).
   */
  readonly version: SnapshotVersion;
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
   * v2: each entry carries `parsedArgs` so the synthesised
   * `ToolCallPart` on resume includes the validated input the tool
   * actually received. v1 entries lack this field; resume falls back to
   * `undefined` for those siblings (matching pre-v0.1.9 behaviour).
   *
   * Empty when the entire batch was pending.
   */
  resolvedSiblings: ToolExecutionResult[];
}

/**
 * Forward-migrate a snapshot of any supported version to the current
 * shape ({@link CURRENT_SNAPSHOT_VERSION}). Idempotent — passing a v2
 * snapshot returns an equivalent v2 snapshot.
 *
 * Today the only migration is v1 → v2: it bumps `version` and leaves
 * `resolvedSiblings[].parsedArgs` undefined (the field is optional, so
 * v2 callers handle the absence by falling back to the v1 behaviour).
 *
 * Any other version triggers a thrown error so unknown future versions
 * cannot silently corrupt a resume.
 */
export function migrateSnapshot(snapshot: AgentSnapshot): AgentSnapshot {
  if (snapshot.version === CURRENT_SNAPSHOT_VERSION) return snapshot;
  if (snapshot.version === 1) {
    return {
      ...snapshot,
      version: 2 as const,
    };
  }
  throw new Error(
    `Cannot migrate AgentSnapshot — unknown version ${(snapshot as { version?: unknown }).version}. ` +
      `This SDK supports versions 1 and 2.`,
  );
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
  /** Per-resume override of {@link CreateAgentOptions.repairToolCall}. */
  repairToolCall?: RepairToolCall;
  /** Per-resume override of {@link CreateAgentOptions.prepareStep}. */
  prepareStep?: PrepareStep;
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
