import { InvalidPromptError } from '../errors.js';
import type { ContentPart } from '../types/content.js';
import type { ChatMessage, NormalizedMessage } from '../types/messages.js';

/**
 * Either a single user prompt or a full message list. Both forms are normalized
 * to the same internal representation for providers.
 */
export interface PromptInput {
  /** Convenience: a single user prompt. Mutually exclusive with `messages`. */
  prompt?: string;
  /** Optional system instruction prepended to the conversation. */
  system?: string;
  messages?: ChatMessage[];
}

export function normalizePrompt(input: PromptInput): NormalizedMessage[] {
  const { prompt, system, messages } = input;

  if (prompt === undefined && (messages === undefined || messages.length === 0)) {
    throw new InvalidPromptError('Either `prompt` or `messages` must be provided.');
  }

  if (prompt !== undefined && messages !== undefined && messages.length > 0) {
    throw new InvalidPromptError(
      'Use either `prompt` or `messages`, not both. Pass `system` separately if needed.',
    );
  }

  const out: NormalizedMessage[] = [];

  if (system !== undefined && system.length > 0) {
    out.push({ role: 'system', content: [{ type: 'text', text: system }] });
  }

  if (prompt !== undefined) {
    out.push({ role: 'user', content: [{ type: 'text', text: prompt }] });
    return out;
  }

  for (const m of messages ?? []) {
    out.push(normalizeMessage(m));
  }

  return out;
}

function normalizeMessage(msg: ChatMessage): NormalizedMessage {
  switch (msg.role) {
    case 'system':
      return { role: 'system', content: [{ type: 'text', text: msg.content }] };

    case 'user': {
      if (typeof msg.content === 'string') {
        return { role: 'user', content: [{ type: 'text', text: msg.content }] };
      }
      const parts: ContentPart[] = msg.content.map((p) => {
        switch (p.type) {
          case 'text':
            return p;
          case 'image':
            return {
              type: 'image',
              image: p.image,
              ...(p.mimeType !== undefined ? { mimeType: p.mimeType } : {}),
            };
          case 'audio':
            return {
              type: 'audio',
              audio: p.audio,
              ...(p.mimeType !== undefined ? { mimeType: p.mimeType } : {}),
            };
          case 'file':
            return {
              type: 'file',
              file: p.file,
              ...(p.mimeType !== undefined ? { mimeType: p.mimeType } : {}),
              ...(p.filename !== undefined ? { filename: p.filename } : {}),
            };
          default: {
            const _exhaustive: never = p;
            return _exhaustive;
          }
        }
      });
      return { role: 'user', content: parts };
    }

    case 'assistant': {
      if (typeof msg.content === 'string') {
        return { role: 'assistant', content: [{ type: 'text', text: msg.content }] };
      }
      return { role: 'assistant', content: msg.content as ContentPart[] };
    }

    case 'tool':
      return { role: 'tool', content: msg.content };
  }
}
