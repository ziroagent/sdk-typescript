import type {
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

export type StepEvent =
  | { type: 'step-start'; index: number }
  | { type: 'llm-finish'; index: number; text: string; toolCalls: ToolCallPart[] }
  | { type: 'tool-result'; index: number; result: ToolExecutionResult }
  | { type: 'step-finish'; step: AgentStep }
  | { type: 'agent-finish'; reason: 'completed' | 'stopWhen' | 'maxSteps' | 'aborted' };

export type StepEventListener = (event: StepEvent) => void | Promise<void>;

/** Internal: full conversation including the seeded prompt and accumulated turns. */
export type ConversationMessages = ChatMessage[];
