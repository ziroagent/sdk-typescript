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
  /** RFC 0013 — capability tags declared on the tool (e.g. `network`, `fs:write:/tmp`). */
  ToolCapabilities: 'ziroagent.tool.capabilities',
  /** RFC 0013 — browser primitive when span is `ziro.browser.action`. */
  BrowserOperation: 'ziroagent.browser.operation',

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
  BudgetTenantId: 'ziroagent.budget.tenant_id',
  BudgetSpecHard: 'ziroagent.budget.spec.hard',
  BudgetUsedUsd: 'ziroagent.budget.used.usd',
  BudgetUsedTokens: 'ziroagent.budget.used.tokens',
  BudgetUsedLlmCalls: 'ziroagent.budget.used.llm_calls',
  BudgetUsedSteps: 'ziroagent.budget.used.steps',
  BudgetUsedDurationMs: 'ziroagent.budget.used.duration_ms',
  BudgetRemainingUsd: 'ziroagent.budget.remaining.usd',
  BudgetRemainingTokens: 'ziroagent.budget.remaining.tokens',
  BudgetRemainingLlmCalls: 'ziroagent.budget.remaining.llm_calls',
  BudgetRemainingSteps: 'ziroagent.budget.remaining.steps',
  BudgetRemainingDurationMs: 'ziroagent.budget.remaining.duration_ms',
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

  // Multi-agent handoff attributes — Ziro extensions; see RFC 0007 §Tracing.
  // The span name is `ziro.agent.handoff` and wraps the sub-agent's `run`
  // call. Parent and target names are denormalised so a query like
  // `parent="triage" AND target="billing"` works without joining traces.
  AgentName: 'ziroagent.agent.name',
  HandoffParentAgent: 'ziroagent.handoff.parent.name',
  HandoffTargetAgent: 'ziroagent.handoff.target.name',
  HandoffDepth: 'ziroagent.handoff.depth',
  HandoffMaxDepth: 'ziroagent.handoff.max_depth',
  HandoffChain: 'ziroagent.handoff.chain',
  HandoffReason: 'ziroagent.handoff.reason',
  HandoffMessageCount: 'ziroagent.handoff.messages.count',
  HandoffFiltered: 'ziroagent.handoff.input_filter.applied',

  /** Model fallback chain — Ziro extensions; see RFC 0015. */
  ModelFallbackAttempt: 'ziroagent.model.fallback.attempt',
  ModelFallbackFromModel: 'ziroagent.model.fallback.from_model',
  ModelFallbackToModel: 'ziroagent.model.fallback.to_model',

  /** Conversation / memory pipeline — Ziro extensions; see RFC 0011. */
  ThreadId: 'ziroagent.thread.id',
  MemoryPhase: 'ziroagent.memory.phase',
  MemoryProcessorIndex: 'ziroagent.memory.processor.index',
  MemoryProcessorCount: 'ziroagent.memory.processor.count',
} as const;

/** Value type accepted by the span attribute API. */
export type AttrValue = string | number | boolean | string[] | number[] | boolean[];
