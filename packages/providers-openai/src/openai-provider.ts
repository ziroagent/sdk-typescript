import type { LanguageModel } from '@ziroagent/core';
import { OpenAIChatModel, type OpenAIChatModelId } from './openai-chat-model.js';

export interface OpenAIProviderOptions {
  /** Defaults to `process.env.OPENAI_API_KEY`. */
  apiKey?: string;
  /** Override the base URL (useful for proxies / Azure / OpenRouter). */
  baseURL?: string;
  /** Optional organization id (`OpenAI-Organization` header). */
  organization?: string;
  /** Optional project id (`OpenAI-Project` header). */
  project?: string;
  /** Extra default headers attached to every request. */
  headers?: Record<string, string>;
  /** Custom `fetch`. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export interface OpenAIProvider {
  (modelId: OpenAIChatModelId): LanguageModel;
  chat(modelId: OpenAIChatModelId): LanguageModel;
}

export function createOpenAI(options: OpenAIProviderOptions = {}): OpenAIProvider {
  const apiKey = options.apiKey ?? loadEnv('OPENAI_API_KEY');
  const baseURL = options.baseURL ?? 'https://api.openai.com/v1';
  const fetcher = options.fetch ?? globalThis.fetch;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (options.organization) headers['OpenAI-Organization'] = options.organization;
  if (options.project) headers['OpenAI-Project'] = options.project;

  const make = (modelId: OpenAIChatModelId): LanguageModel =>
    new OpenAIChatModel({
      modelId,
      baseURL,
      headers,
      fetcher,
    });

  const provider = ((modelId: OpenAIChatModelId) => make(modelId)) as OpenAIProvider;
  provider.chat = make;
  return provider;
}

/** Default singleton provider — reads `OPENAI_API_KEY` from env. */
export const openai: OpenAIProvider = createOpenAI();

function loadEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}
