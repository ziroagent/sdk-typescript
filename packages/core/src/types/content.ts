/**
 * A piece of content within a message. Multimodal-ready: today we ship `text`,
 * `image`, and `tool` parts; future work can add `audio`, `video`, `file`.
 */
export type ContentPart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  /** A URL, data URL, or base64-encoded image payload. */
  image: string | URL | Uint8Array;
  mimeType?: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}
