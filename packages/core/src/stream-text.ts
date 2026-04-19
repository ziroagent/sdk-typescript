import type { GenerateTextOptions } from './generate-text.js';
import { buildStreamTextResult, type StreamTextResult } from './streaming/text-stream.js';
import { normalizePrompt } from './util/normalize-prompt.js';

export type StreamTextOptions = GenerateTextOptions & {
  /** Called once per error event from the underlying model stream. */
  onError?: (err: unknown) => void;
};

/**
 * Streaming counterpart of `generateText`. Returns a result object with two
 * `ReadableStream`s (text-only and full event), plus aggregate promises that
 * resolve when the stream completes.
 */
export async function streamText(options: StreamTextOptions): Promise<StreamTextResult> {
  const { model, tools, toolChoice, onError, ...rest } = options;

  const messages = normalizePrompt(rest);

  const source = await model.stream({
    messages,
    ...(tools !== undefined ? { tools } : {}),
    ...(toolChoice !== undefined ? { toolChoice } : {}),
    ...(rest.temperature !== undefined ? { temperature: rest.temperature } : {}),
    ...(rest.topP !== undefined ? { topP: rest.topP } : {}),
    ...(rest.topK !== undefined ? { topK: rest.topK } : {}),
    ...(rest.maxTokens !== undefined ? { maxTokens: rest.maxTokens } : {}),
    ...(rest.stopSequences !== undefined ? { stopSequences: rest.stopSequences } : {}),
    ...(rest.seed !== undefined ? { seed: rest.seed } : {}),
    ...(rest.providerOptions !== undefined ? { providerOptions: rest.providerOptions } : {}),
    ...(rest.abortSignal !== undefined ? { abortSignal: rest.abortSignal } : {}),
    ...(rest.headers !== undefined ? { headers: rest.headers } : {}),
  });

  return buildStreamTextResult({ source, ...(onError ? { onError } : {}) });
}
