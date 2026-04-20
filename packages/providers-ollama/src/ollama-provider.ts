import type { LanguageModel } from '@ziro-agent/core';
import { OllamaChatModel, type OllamaChatModelId } from './ollama-chat-model.js';

export interface OllamaProviderOptions {
  /**
   * Base URL of the Ollama daemon. Defaults to
   * `process.env.OLLAMA_BASE_URL` then `http://localhost:11434`.
   *
   * For remote / containerised Ollama (e.g. compose stack, Coolify),
   * set this to `http://ollama:11434` or whatever your network exposes.
   */
  baseURL?: string;
  /** Extra default headers attached to every request. */
  headers?: Record<string, string>;
  /** Custom `fetch`. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /**
   * Default Ollama-native sampling options (`num_ctx`, `mirostat`,
   * `repeat_penalty`, …) merged into every request's `options` block.
   * Per-call overrides via `ModelCallOptions.providerOptions.options`
   * still win.
   */
  defaultOptions?: Record<string, unknown>;
}

export interface OllamaProvider {
  (modelId: OllamaChatModelId): LanguageModel;
  chat(modelId: OllamaChatModelId): LanguageModel;
}

/**
 * Build an {@link OllamaProvider} bound to a specific Ollama daemon.
 * Mirrors `createOpenAI` / `createAnthropic` so swapping providers in
 * `createAgent({ model })` is a one-line change.
 */
export function createOllama(options: OllamaProviderOptions = {}): OllamaProvider {
  const baseURL = (
    options.baseURL ??
    loadEnv('OLLAMA_BASE_URL') ??
    'http://localhost:11434'
  ).replace(/\/+$/, '');
  const fetcher = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const make = (modelId: OllamaChatModelId): LanguageModel =>
    new OllamaChatModel({
      modelId,
      baseURL,
      headers,
      fetcher,
      ...(options.defaultOptions ? { defaultOptions: options.defaultOptions } : {}),
    });

  const provider = ((modelId: OllamaChatModelId) => make(modelId)) as OllamaProvider;
  provider.chat = make;
  return provider;
}

/**
 * Default singleton — connects to `localhost:11434` (or
 * `OLLAMA_BASE_URL` if set). Suitable for the typical
 * `ollama serve` setup; build a custom provider with `createOllama()`
 * for remote / authenticated daemons.
 */
export const ollama: OllamaProvider = createOllama();

function loadEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}
