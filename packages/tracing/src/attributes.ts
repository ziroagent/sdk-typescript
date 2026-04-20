/**
 * Span and event attribute keys, aligned with the OpenTelemetry GenAI
 * semantic conventions (`gen_ai.*`) where applicable. We deliberately use
 * string literals — and not enums — so consumers can reference the keys
 * from any language without an OTel import.
 *
 * Reference: https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const ATTR = {
  GenAiSystem: 'gen_ai.system',
  GenAiOperationName: 'gen_ai.operation.name',
  GenAiRequestModel: 'gen_ai.request.model',
  GenAiRequestTemperature: 'gen_ai.request.temperature',
  GenAiRequestMaxTokens: 'gen_ai.request.max_tokens',
  GenAiResponseModel: 'gen_ai.response.model',
  GenAiResponseId: 'gen_ai.response.id',
  GenAiResponseFinishReasons: 'gen_ai.response.finish_reasons',
  GenAiUsagePromptTokens: 'gen_ai.usage.input_tokens',
  GenAiUsageCompletionTokens: 'gen_ai.usage.output_tokens',
  GenAiUsageTotalTokens: 'gen_ai.usage.total_tokens',

  // Tool call attributes — Ziro extensions; the OTel GenAI spec does not yet
  // define these in stable form.
  ToolName: 'gen_ai.tool.name',
  ToolCallId: 'gen_ai.tool.call.id',
  ToolError: 'gen_ai.tool.error',

  // Agent / workflow attributes — Ziro extensions.
  AgentStepIndex: 'ziroagent.agent.step.index',
  AgentMaxSteps: 'ziroagent.agent.max_steps',
  WorkflowNodeId: 'ziroagent.workflow.node.id',
  WorkflowFinishReason: 'ziroagent.workflow.finish_reason',

  // Budget Guard attributes — Ziro extensions; see RFC 0001 §Observability.
  // We deliberately mirror the `BudgetUsage` field names rather than using
  // `gen_ai.usage.*` so a single trace can carry both per-call usage AND
  // cumulative scope usage without overwriting either.
  BudgetScopeId: 'ziroagent.budget.scope.id',
  BudgetSpecMaxUsd: 'ziroagent.budget.spec.max_usd',
  BudgetSpecMaxTokens: 'ziroagent.budget.spec.max_tokens',
  BudgetSpecMaxLlmCalls: 'ziroagent.budget.spec.max_llm_calls',
  BudgetSpecMaxSteps: 'ziroagent.budget.spec.max_steps',
  BudgetSpecMaxDurationMs: 'ziroagent.budget.spec.max_duration_ms',
  BudgetUsedUsd: 'ziroagent.budget.used.usd',
  BudgetUsedTokens: 'ziroagent.budget.used.tokens',
  BudgetUsedLlmCalls: 'ziroagent.budget.used.llm_calls',
  BudgetUsedDurationMs: 'ziroagent.budget.used.duration_ms',
  BudgetExceededKind: 'ziroagent.budget.exceeded.kind',
  BudgetExceededLimit: 'ziroagent.budget.exceeded.limit',
  BudgetExceededObserved: 'ziroagent.budget.exceeded.observed',
  BudgetWarningKind: 'ziroagent.budget.warning.kind',
  BudgetWarningObserved: 'ziroagent.budget.warning.observed',
  BudgetWarningThreshold: 'ziroagent.budget.warning.threshold',
  BudgetScopeOutcome: 'ziroagent.budget.scope.outcome',

  // HITL / Approval attributes — Ziro extensions; see RFC 0002 §Tracing.
  ApprovalToolName: 'ziroagent.approval.tool.name',
  ApprovalToolCallId: 'ziroagent.approval.tool.call.id',
  ApprovalDecision: 'ziroagent.approval.decision',
  ApprovalReason: 'ziroagent.approval.reason',
  ApprovalModified: 'ziroagent.approval.modified',
  ApprovalStep: 'ziroagent.approval.step',
  AgentSuspendedStep: 'ziroagent.agent.suspended.step',
  AgentSuspendedPendingCount: 'ziroagent.agent.suspended.pending_count',
  AgentSuspendedAgentId: 'ziroagent.agent.suspended.agent_id',
  AgentResumedStep: 'ziroagent.agent.resumed.step',
  AgentResumedDecisionApprove: 'ziroagent.agent.resumed.decisions.approve',
  AgentResumedDecisionReject: 'ziroagent.agent.resumed.decisions.reject',
  AgentResumedDecisionSuspend: 'ziroagent.agent.resumed.decisions.suspend',
} as const;

/** Value type accepted by the span attribute API. */
export type AttrValue = string | number | boolean | string[] | number[] | boolean[];
