/**
 * A piece of content within a message. Multimodal: `text`, `image`, `audio`,
 * `file`, and tool parts; `video` reserved for a later RFC.
 */
export type ContentPart =
  | TextPart
  | ImagePart
  | AudioPart
  | FilePart
  | ToolCallPart
  | ToolResultPart;

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

export interface AudioPart {
  type: 'audio';
  /** Raw bytes, a `file:` / `https:` URL, or a data URL (`data:audio/...;base64,...`). */
  audio: string | URL | Uint8Array;
  /** IANA media type when known (e.g. `audio/wav`). */
  mimeType?: string;
}

export interface FilePart {
  type: 'file';
  /** Same conventions as {@link AudioPart.audio} — URL/handle preferred for large payloads (RFC 0014). */
  file: string | URL | Uint8Array;
  mimeType?: string;
  filename?: string;
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
