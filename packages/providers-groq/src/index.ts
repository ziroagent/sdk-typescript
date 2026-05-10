import type { LanguageModel } from '@ziro-agent/core';
import type { OpenAIChatModelId } from '@ziro-agent/openai';
import { createOpenAI, type OpenAIProviderOptions } from '@ziro-agent/openai';

export type { OpenAIChatModelId };

/**
 * Options for {@link createGroq}. Same surface as OpenAI provider except defaults:
 * - `apiKey` → `process.env.GROQ_API_KEY`
 * - `baseURL` → `https://api.groq.com/openai/v1`
 */
export type GroqProviderOptions = Omit<OpenAIProviderOptions, 'baseURL'> & {
  baseURL?: string;
};

/** Callable provider shape (matches `@ziro-agent/openai`). */
export interface GroqProvider {
  (modelId: OpenAIChatModelId): LanguageModel;
  chat(modelId: OpenAIChatModelId): LanguageModel;
}

/**
 * Groq exposes an OpenAI-compatible HTTP API. We reuse `@ziro-agent/openai`
 * with Groq’s base URL and default env key.
 *
 * @example
 * ```ts
 * import { generateText } from '@ziro-agent/core';
 * import { groq } from '@ziro-agent/groq';
 *
 * const out = await generateText({
 *   model: groq('llama-3.3-70b-versatile'),
 *   prompt: 'Hello',
 * });
 * ```
 */
export function createGroq(options: GroqProviderOptions = {}): GroqProvider {
  return createOpenAI({
    ...options,
    apiKey: options.apiKey ?? loadEnv('GROQ_API_KEY'),
    baseURL: options.baseURL ?? 'https://api.groq.com/openai/v1',
  }) as GroqProvider;
}

/** Default singleton — reads `GROQ_API_KEY`. */
export const groq: GroqProvider = createGroq();

function loadEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}
