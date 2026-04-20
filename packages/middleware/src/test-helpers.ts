import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
  NormalizedMessage,
} from '@ziro-agent/core';
import { vi } from 'vitest';

/**
 * Tiny `LanguageModel` test double. By default returns the same canned
 * response and stream sequence on every call. Override per-test via
 * `overrides`.
 */
export const makeFakeModel = (overrides: Partial<LanguageModel> = {}): LanguageModel => ({
  modelId: 'fake-1',
  provider: 'fake',
  generate: vi.fn(
    async (_o: ModelCallOptions): Promise<ModelGenerateResult> => ({
      text: 'fresh',
      content: [{ type: 'text', text: 'fresh' }],
      toolCalls: [],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
  ),
  stream: vi.fn(async (): Promise<ReadableStream<ModelStreamPart>> => {
    return new ReadableStream<ModelStreamPart>({
      start(controller) {
        controller.enqueue({ type: 'text-delta', textDelta: 'fresh' });
        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });
        controller.close();
      },
    });
  }),
  ...overrides,
});

export const userMessage = (text: string): NormalizedMessage => ({
  role: 'user',
  content: [{ type: 'text', text }],
});

export const baseOptions = (text = 'hi'): ModelCallOptions => ({
  messages: [userMessage(text)],
});

export const collectStream = async (
  stream: ReadableStream<ModelStreamPart>,
): Promise<ModelStreamPart[]> => {
  const out: ModelStreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
};
