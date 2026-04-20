import type { ApprovalDecision, ApprovalRequest } from './types.js';

/**
 * Internal observer hook so `@ziro-agent/tracing` can mirror approval
 * lifecycle into OTel spans/events without `core` taking a hard
 * dependency on the tracing package. Mirrors the `BudgetObserver`
 * pattern from RFC 0001.
 *
 * Every method is invoked synchronously from `executeToolCalls` /
 * `agent.run`. Implementations MUST NOT throw — exceptions are swallowed
 * (`try/catch` in the call sites) so an instrumentation bug never breaks
 * the user's program.
 */
export interface ApprovalObserver {
  onRequested?(req: ApprovalRequest): void;
  onResolved?(req: ApprovalRequest, decision: ApprovalDecision): void;
  /**
   * Fired when the agent loop captures a snapshot and is about to throw
   * `AgentSuspendedError`. `pendingCount` is the number of pending tool
   * calls in the snapshot (always ≥ 1).
   */
  onAgentSuspended?(args: {
    agentId?: string;
    scopeId?: string;
    step: number;
    pendingCount: number;
  }): void;
  onAgentResumed?(args: {
    agentId?: string;
    scopeId?: string;
    step: number;
    decisionCounts: { approve: number; reject: number; suspend: number };
  }): void;
}

let observer: ApprovalObserver | null = null;

export function setApprovalObserver(next: ApprovalObserver | null): ApprovalObserver | null {
  const prev = observer;
  observer = next;
  return prev;
}

/** @internal */
export function fireApprovalRequested(req: ApprovalRequest): void {
  if (!observer?.onRequested) return;
  try {
    observer.onRequested(req);
  } catch {
    /* swallow — see ApprovalObserver docstring */
  }
}

/** @internal */
export function fireApprovalResolved(req: ApprovalRequest, decision: ApprovalDecision): void {
  if (!observer?.onResolved) return;
  try {
    observer.onResolved(req, decision);
  } catch {
    /* swallow */
  }
}

/** @internal */
export function fireAgentSuspended(args: {
  agentId?: string;
  scopeId?: string;
  step: number;
  pendingCount: number;
}): void {
  if (!observer?.onAgentSuspended) return;
  try {
    observer.onAgentSuspended(args);
  } catch {
    /* swallow */
  }
}

/** @internal */
export function fireAgentResumed(args: {
  agentId?: string;
  scopeId?: string;
  step: number;
  decisionCounts: { approve: number; reject: number; suspend: number };
}): void {
  if (!observer?.onAgentResumed) return;
  try {
    observer.onAgentResumed(args);
  } catch {
    /* swallow */
  }
}

/** @internal — test helper. */
export function _hasApprovalObserverForTesting(): boolean {
  return observer !== null;
}
