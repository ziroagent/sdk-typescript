import type { LanguageModel } from '@ziro-ai/core';
import {
  AnthropicMessagesModel,
  type AnthropicMessagesModelId,
} from './anthropic-messages-model.js';

export interface AnthropicProviderOptions {
  /** Defaults to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;
  baseURL?: string;
  /** API version sent in `anthropic-version`. Defaults to `2023-06-01`. */
  version?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface AnthropicProvider {
  (modelId: AnthropicMessagesModelId): LanguageModel;
  messages(modelId: AnthropicMessagesModelId): LanguageModel;
}

export function createAnthropic(options: AnthropicProviderOptions = {}): AnthropicProvider {
  const apiKey = options.apiKey ?? loadEnv('ANTHROPIC_API_KEY');
  const baseURL = options.baseURL ?? 'https://api.anthropic.com/v1';
  const version = options.version ?? '2023-06-01';
  const fetcher = options.fetch ?? globalThis.fetch;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': version,
    ...options.headers,
  };
  if (apiKey) headers['x-api-key'] = apiKey;

  const make = (modelId: AnthropicMessagesModelId): LanguageModel =>
    new AnthropicMessagesModel({
      modelId,
      baseURL,
      headers,
      fetcher,
    });

  const provider = ((modelId: AnthropicMessagesModelId) => make(modelId)) as AnthropicProvider;
  provider.messages = make;
  return provider;
}

export const anthropic: AnthropicProvider = createAnthropic();

function loadEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}
