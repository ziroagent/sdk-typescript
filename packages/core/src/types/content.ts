/**
 * A piece of content within a message. Multimodal: `text`, `image`, `audio`,
 * `file`, `video` (Gemini maps it; OpenAI maps via the `file` content part; other
 * providers may still reject), and tool parts.
 */
export type ContentPart =
  | TextPart
  | ImagePart
  | AudioPart
  | FilePart
  | VideoPart
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

/**
 * User video attachment (RFC 0014 P2). Normalises like other media; **Gemini**
 * maps to `inlineData` / `fileData`. **OpenAI** maps to the chat `file` part
 * (`file_id` or `file_data`; no remote URL fetch — same constraints as {@link FilePart}).
 * Anthropic and Ollama still throw {@link UnsupportedPartError}.
 */
export interface VideoPart {
  type: 'video';
  /** URL, `data:` URL, or raw bytes — same transport conventions as {@link ImagePart.image}. */
  video: string | URL | Uint8Array;
  mimeType?: string;
  /** Optional display name for providers that accept it (e.g. OpenAI `file.filename`). */
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
