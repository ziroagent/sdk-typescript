export { BudgetExceededError, type BudgetExceededKind } from './budget/errors.js';
export { type BudgetObserver, setBudgetObserver } from './budget/observer.js';
export { applyResolution, resolveOnExceed } from './budget/resolver.js';
export {
  getCurrentBudget,
  getCurrentScope,
  intersectSpecs,
  type WithBudgetOptions,
  withBudget,
} from './budget/scope.js';
export type {
  BudgetContext,
  BudgetOnExceed,
  BudgetResolution,
  BudgetSpec,
  BudgetUsage,
  BudgetWarnAt,
  CostEstimate,
} from './budget/types.js';
export * from './errors.js';
export * from './generate-object.js';
export * from './generate-text.js';
export {
  type ApprovalObserver,
  fireAgentResumed,
  fireAgentSuspended,
  fireApprovalRequested,
  fireApprovalResolved,
  setApprovalObserver,
} from './hitl/observer.js';
export {
  type AutoApproverOptions,
  autoApprove,
  autoReject,
  autoSuspend,
  createAutoApprover,
} from './hitl/presets.js';
export type {
  ApprovalContext,
  ApprovalDecision,
  ApprovalRequest,
  Approver,
  CoreAgentSnapshotFields,
  PendingApproval,
  RequiresApproval,
  SerializableBudgetSpec,
} from './hitl/types.js';
export * from './stream-text.js';
export * from './streaming/text-stream.js';
export * from './types/content.js';
export * from './types/finish-reason.js';
export * from './types/messages.js';
export * from './types/middleware.js';
export * from './types/model.js';
export * from './types/usage.js';
export { estimateTokensFromMessages, estimateTokensFromString } from './util/estimate-tokens.js';
export { type FallbackChainOptions, withFallbackChain } from './util/fallback-model.js';
export * from './util/normalize-prompt.js';
export { wrapModel } from './util/wrap-model.js';
