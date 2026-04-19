import type { ContentPart, TextPart, ToolCallPart, ToolResultPart } from './content.js';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string | Array<TextPart | { type: 'image'; image: string | URL | Uint8Array }>;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | Array<TextPart | ToolCallPart>;
}

export interface ToolMessage {
  role: 'tool';
  content: ToolResultPart[];
}

export type ChatMessage = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

/**
 * A normalized message used internally — always uses `ContentPart[]`.
 */
export interface NormalizedMessage {
  role: Role;
  content: ContentPart[];
}
