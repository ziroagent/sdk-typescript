import type { ContentPart, TextPart } from '../types/content.js';
import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from '../types/model.js';
import type { TokenUsage } from '../types/usage.js';

export interface CreateMockLanguageModelOptions {
  modelId?: string;
  provider?: string;
  /**
   * Default `generate()` echoes `"{prefix}:{userText}"` where `userText` is
   * derived from the last user message's text parts.
   */
  responsePrefix?: string;
  /** When set, default `generate()` returns these tool calls (and empty text). */
  toolCalls?: ModelGenerateResult['toolCalls'];
  /** Override token usage on the default `generate()` path. */
  usage?: TokenUsage;
  /** Full override of `LanguageModel.generate`. */
  generate?: (options: ModelCallOptions) => Promise<ModelGenerateResult>;
  /** Full override of `LanguageModel.stream`. */
  stream?: (options: ModelCallOptions) => Promise<ReadableStream<ModelStreamPart>>;
}

function userTextFromMessages(messages: ModelCallOptions['messages']): string {
  return messages
    .flatMap((m) => m.content)
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

const defaultUsage: TokenUsage = { promptTokens: 1, completionTokens: 2, totalTokens: 3 };

/**
 * Deterministic {@link LanguageModel} for unit tests and eval fixtures.
 * Ships under `@ziro-agent/core/testing` (RFC 0008 row B6).
 */
export function createMockLanguageModel(
  options: CreateMockLanguageModelOptions = {},
): LanguageModel {
  const modelId = options.modelId ?? 'mock-model';
  const provider = options.provider ?? 'mock';
  const prefix = options.responsePrefix ?? 'mock';

  return {
    modelId,
    provider,
    async generate(opts) {
      if (options.generate) return options.generate(opts);
      const usage = options.usage ?? defaultUsage;
      const user = userTextFromMessages(opts.messages);
      const hasTools = Boolean(opts.tools?.length && options.toolCalls?.length);
      const text = hasTools ? '' : `${prefix}:${user}`;
      const content: ContentPart[] = text ? [{ type: 'text', text }] : [];
      return {
        text,
        content,
        toolCalls: options.toolCalls ?? [],
        finishReason: 'stop',
        usage,
      };
    },
    async stream(opts) {
      if (options.stream) return options.stream(opts);
      const user = userTextFromMessages(opts.messages);
      const full = `${prefix}:${user}`;
      const mid = Math.max(1, Math.ceil(full.length / 2));
      const parts: ModelStreamPart[] = [
        { type: 'text-delta', textDelta: full.slice(0, mid) },
        { type: 'text-delta', textDelta: full.slice(mid) },
        { type: 'finish', finishReason: 'stop', usage: { totalTokens: 5 } },
      ];
      return new ReadableStream({
        start(c) {
          for (const p of parts) c.enqueue(p);
          c.close();
        },
      });
    },
  };
}
