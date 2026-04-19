import type { ContentPart, ToolCallPart } from './types/content.js';
import type { FinishReason } from './types/finish-reason.js';
import type { LanguageModel, ModelCallOptions, ToolDefinitionForModel } from './types/model.js';
import type { TokenUsage } from './types/usage.js';
import { normalizePrompt, type PromptInput } from './util/normalize-prompt.js';

export interface GenerateTextOptions extends PromptInput {
  model: LanguageModel;
  tools?: ToolDefinitionForModel[];
  toolChoice?: ModelCallOptions['toolChoice'];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  seed?: number;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface GenerateTextResult {
  text: string;
  content: ContentPart[];
  toolCalls: ToolCallPart[];
  finishReason: FinishReason;
  usage: TokenUsage;
  rawResponse?: unknown;
}

/**
 * Single-shot text generation. The lowest-level user-facing primitive — most
 * users should reach for `streamText` (UX) or `createAgent` (tool-use loops)
 * instead, but `generateText` is invaluable for one-off completions, evals,
 * and tests.
 */
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
  const { model, tools, toolChoice, ...rest } = options;

  const messages = normalizePrompt(rest);

  const result = await model.generate({
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

  return {
    text: result.text,
    content: result.content,
    toolCalls: result.toolCalls,
    finishReason: result.finishReason,
    usage: result.usage,
    ...(result.rawResponse !== undefined ? { rawResponse: result.rawResponse } : {}),
  };
}
