/**
 * Built-in {@link Approver} presets — convenience callbacks for common
 * "I just want HITL off in this environment" patterns.
 *
 * Why presets instead of a `approver: true` boolean shortcut?
 *
 *   1. Auto-approving every gated tool is the literal definition of
 *      disabling HITL. Making the user write `approver: autoApprove`
 *      keeps that intent explicit at the call site, surveyable in
 *      `git grep`, and reviewable in code review.
 *   2. The same shape composes for `agent.run`, `agent.resume`, and
 *      `executeToolCalls` without changing the field type.
 *   3. {@link createAutoApprover} layers tool-name allow/deny lists on
 *      top of the same primitive, which a boolean field never can.
 *
 * Use these in dev / test / replay environments. In production you
 * almost certainly want a real `Approver` callback that consults a
 * human or a policy engine.
 */

import type { ApprovalDecision, ApprovalRequest, Approver } from './types.js';

/**
 * Approver that approves every request unmodified. Equivalent to
 * disabling HITL for the run.
 *
 * Typical use: dev seeds, replay harnesses, eval grids that exercise
 * the full tool surface without a human in the loop.
 *
 * ```ts
 * import { autoApprove } from '@ziro-agent/core';
 *
 * await agent.run({ prompt: '...', approver: autoApprove });
 * ```
 *
 * Production code should pass a real `Approver`. If you genuinely want
 * to skip HITL for a run, use this preset (NOT `() => ({ decision:
 * 'approve' })` inline) so reviewers can grep for the pattern.
 */
export const autoApprove: Approver = (_req: ApprovalRequest) => ({ decision: 'approve' });

/**
 * Approver that rejects every request with the given reason. The tool's
 * `execute()` is NOT called — the loop receives an `isError: true` tool
 * result and continues, giving the model a chance to back off.
 *
 * Useful for "block all gated tools but keep the agent running" tests.
 */
export function autoReject(reason = 'Auto-rejected (no human approver configured).'): Approver {
  return (_req: ApprovalRequest) => ({ decision: 'reject', reason });
}

/**
 * Approver that suspends every request, producing the standard
 * `AgentSuspendedError` flow. Equivalent to passing no approver at all
 * — supplied as a preset for symmetry and so callers can switch between
 * `autoApprove` and `autoSuspend` from a config flag without branching.
 */
export const autoSuspend: Approver = (_req: ApprovalRequest) => ({ decision: 'suspend' });

export interface AutoApproverOptions {
  /**
   * Tool names that are auto-approved without consulting the default
   * branch. Takes precedence over `deny`. When neither list matches,
   * the request falls through to `default`.
   */
  allow?: ReadonlyArray<string>;
  /**
   * Tool names that are auto-rejected. Takes precedence over `default`
   * but is overridden by `allow` (so `allow` is the explicit "yes").
   */
  deny?: ReadonlyArray<string>;
  /**
   * Reason attached to deny-list rejections. Defaults to a generic
   * message; pass something descriptive so the model can react.
   */
  denyReason?: string;
  /**
   * Decision used when neither `allow` nor `deny` match. Defaults to
   * `'suspend'` (safe default — never silently approve an unknown
   * tool) but can be set to `'approve'` for "approve everything except
   * the deny list" or `'reject'` for "reject everything except the
   * allow list".
   */
  default?: 'approve' | 'reject' | 'suspend';
}

/**
 * Build an {@link Approver} that decides based on tool-name allow /
 * deny lists. Composes with the basic preset semantics:
 *
 * ```ts
 * import { createAutoApprover } from '@ziro-agent/core';
 *
 * const approver = createAutoApprover({
 *   allow: ['searchDocs', 'getWeather'],   // auto-approved
 *   deny:  ['transferFunds', 'deleteUser'], // auto-rejected
 *   default: 'suspend',                     // suspend everything else
 * });
 *
 * await agent.run({ prompt: '...', approver });
 * ```
 *
 * Allow takes precedence over deny so a tool can never be both. The
 * default branch is `'suspend'` to preserve HITL semantics for any
 * tool the operator forgot to classify — fail-safe, not fail-open.
 */
export function createAutoApprover(options: AutoApproverOptions): Approver {
  const allow = options.allow ? new Set(options.allow) : undefined;
  const deny = options.deny ? new Set(options.deny) : undefined;
  const fallback = options.default ?? 'suspend';
  const denyReason = options.denyReason ?? 'Tool is on the auto-approver deny list.';

  return (req: ApprovalRequest): ApprovalDecision => {
    if (allow?.has(req.toolName)) return { decision: 'approve' };
    if (deny?.has(req.toolName)) return { decision: 'reject', reason: denyReason };
    switch (fallback) {
      case 'approve':
        return { decision: 'approve' };
      case 'reject':
        return { decision: 'reject', reason: denyReason };
      case 'suspend':
        return { decision: 'suspend' };
    }
  };
}
