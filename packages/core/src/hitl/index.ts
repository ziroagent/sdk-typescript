export {
  type ApprovalObserver,
  fireAgentResumed,
  fireAgentSuspended,
  fireApprovalRequested,
  fireApprovalResolved,
  setApprovalObserver,
} from './observer.js';
export {
  type AutoApproverOptions,
  autoApprove,
  autoReject,
  autoSuspend,
  createAutoApprover,
} from './presets.js';
export type {
  ApprovalContext,
  ApprovalDecision,
  ApprovalRequest,
  Approver,
  CoreAgentSnapshotFields,
  PendingApproval,
  RequiresApproval,
  SerializableBudgetSpec,
} from './types.js';
