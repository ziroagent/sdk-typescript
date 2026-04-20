import type { ApprovalDecision, ApprovalObserver, ApprovalRequest } from '@ziro-agent/core';
import { setApprovalObserver } from '@ziro-agent/core';
import { ATTR, type AttrValue } from './attributes.js';
import { getTracer } from './tracer.js';

/**
 * Bridge `@ziro-agent/core`'s HITL / approval lifecycle into OpenTelemetry
 * spans + events. Call once at process startup AFTER `setTracer(...)` so
 * the active tracer is the OTel-backed one — see RFC 0002 §Tracing for
 * the event catalogue.
 *
 * Unlike `instrumentBudget` (which owns a long-lived `ziro.budget.scope`
 * span), HITL instrumentation is mostly point-in-time events:
 *   - `ziro.approval.requested` / `.granted` / `.rejected` / `.suspended`
 *     fire as standalone events (no span) — the tool call's own span (if
 *     any) is the parent.
 *   - `ziro.agent.suspended` and `ziro.agent.resumed` fire as `internal`
 *     spans of zero duration — useful for trace timelines that need a
 *     visible marker for the pause boundary.
 *
 * Returns an `unregister()` callback (and the previously-installed
 * observer) so a host process can swap instrumentations cleanly — useful
 * in tests.
 */
export function instrumentApproval(): {
  unregister: () => void;
  previous: ApprovalObserver | null;
} {
  const observer: ApprovalObserver = {
    onRequested(req: ApprovalRequest) {
      const tracer = getTracer();
      const span = tracer.startSpan('ziro.approval.requested', {
        kind: 'internal',
        attributes: requestAttrs(req),
      });
      // Point-in-time marker; end immediately.
      span.end();
    },

    onResolved(req: ApprovalRequest, decision: ApprovalDecision) {
      const tracer = getTracer();
      const eventName =
        decision.decision === 'approve'
          ? 'ziro.approval.granted'
          : decision.decision === 'reject'
            ? 'ziro.approval.rejected'
            : 'ziro.approval.suspended';
      const span = tracer.startSpan(eventName, {
        kind: 'internal',
        attributes: resolutionAttrs(req, decision),
      });
      span.end();
    },

    onAgentSuspended(args) {
      const tracer = getTracer();
      const attrs: Record<string, AttrValue> = {
        [ATTR.AgentSuspendedStep]: args.step,
        [ATTR.AgentSuspendedPendingCount]: args.pendingCount,
      };
      if (args.agentId !== undefined) attrs[ATTR.AgentSuspendedAgentId] = args.agentId;
      if (args.scopeId !== undefined) attrs[ATTR.BudgetScopeId] = args.scopeId;
      const span = tracer.startSpan('ziro.agent.suspended', {
        kind: 'internal',
        attributes: attrs,
      });
      span.end();
    },

    onAgentResumed(args) {
      const tracer = getTracer();
      const attrs: Record<string, AttrValue> = {
        [ATTR.AgentResumedStep]: args.step,
        [ATTR.AgentResumedDecisionApprove]: args.decisionCounts.approve,
        [ATTR.AgentResumedDecisionReject]: args.decisionCounts.reject,
        [ATTR.AgentResumedDecisionSuspend]: args.decisionCounts.suspend,
      };
      if (args.agentId !== undefined) attrs[ATTR.AgentSuspendedAgentId] = args.agentId;
      if (args.scopeId !== undefined) attrs[ATTR.BudgetScopeId] = args.scopeId;
      const span = tracer.startSpan('ziro.agent.resumed', {
        kind: 'internal',
        attributes: attrs,
      });
      span.end();
    },
  };

  const previous = setApprovalObserver(observer);

  return {
    previous,
    unregister: () => setApprovalObserver(previous) as never,
  };
}

function requestAttrs(req: ApprovalRequest): Record<string, AttrValue> {
  return {
    [ATTR.ApprovalToolName]: req.toolName,
    [ATTR.ApprovalToolCallId]: req.toolCallId,
    [ATTR.ApprovalStep]: req.context.step,
  };
}

function resolutionAttrs(
  req: ApprovalRequest,
  decision: ApprovalDecision,
): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {
    [ATTR.ApprovalToolName]: req.toolName,
    [ATTR.ApprovalToolCallId]: req.toolCallId,
    [ATTR.ApprovalStep]: req.context.step,
    [ATTR.ApprovalDecision]: decision.decision,
  };
  if (decision.decision === 'reject' && decision.reason !== undefined) {
    out[ATTR.ApprovalReason] = decision.reason;
  }
  if (decision.decision === 'approve') {
    out[ATTR.ApprovalModified] = decision.modifiedInput !== undefined;
  }
  return out;
}
