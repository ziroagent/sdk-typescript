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
  AgentStepIndex: 'ziro.agent.step.index',
  AgentMaxSteps: 'ziro.agent.max_steps',
  WorkflowNodeId: 'ziro.workflow.node.id',
  WorkflowFinishReason: 'ziro.workflow.finish_reason',
} as const;

/** Value type accepted by the span attribute API. */
export type AttrValue = string | number | boolean | string[] | number[] | boolean[];
