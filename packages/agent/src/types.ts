import type {
  BudgetExceededError,
  BudgetUsage,
  ChatMessage,
  ContentPart,
  FinishReason,
  TokenUsage,
  ToolCallPart,
} from '@ziro-agent/core';
import type { ToolExecutionResult } from '@ziro-agent/tools';

export interface AgentStep {
  /** 1-indexed step number. */
  index: number;
  /** Assistant text emitted in this step (may be empty if the model only made tool calls). */
  text: string;
  /** Structured assistant content (text + tool-call parts). */
  content: ContentPart[];
  /** Tool calls the model requested in this step. */
  toolCalls: ToolCallPart[];
  /** Resolved tool results, in the same order as `toolCalls`. */
  toolResults: ToolExecutionResult[];
  finishReason: FinishReason;
  usage: TokenUsage;
}

/**
 * Why the agent loop terminated. Added in v0.1.5:
 *   - `'budgetExceeded'` — only emitted when `BudgetSpec.onExceed` is `'truncate'`;
 *     with the default `'throw'` semantics the agent re-raises `BudgetExceededError`
 *     instead of returning.
 */
export type AgentFinishReason =
  | 'completed'
  | 'stopWhen'
  | 'maxSteps'
  | 'aborted'
  | 'budgetExceeded';

/**
 * Surfaced on `AgentRunResult.budgetExceeded` whenever the loop terminated via
 * `onExceed: 'truncate'`. Mirrors `BudgetExceededError`'s shape so callers can
 * branch on `kind` without importing the error class.
 */
export interface AgentBudgetExceededInfo {
  kind: BudgetExceededError['kind'];
  limit: number;
  observed: number;
  scopeId: string;
  partialUsage: BudgetUsage;
  /**
   * Where the budget tripped: `preflight` for the agent loop's pre-LLM check,
   * `postcall` after a completed model call, `tool` for a budget thrown
   * inside `executeToolCalls` (whose error becomes a tool result, then the
   * loop converts it back into a budget halt).
   */
  origin: 'preflight' | 'postcall' | 'tool';
}

export type StepEvent =
  | { type: 'step-start'; index: number }
  | { type: 'llm-finish'; index: number; text: string; toolCalls: ToolCallPart[] }
  | { type: 'tool-result'; index: number; result: ToolExecutionResult }
  | { type: 'step-finish'; step: AgentStep }
  | { type: 'budget-exceeded'; info: AgentBudgetExceededInfo }
  | { type: 'agent-finish'; reason: AgentFinishReason };

export type StepEventListener = (event: StepEvent) => void | Promise<void>;

/** Internal: full conversation including the seeded prompt and accumulated turns. */
export type ConversationMessages = ChatMessage[];
