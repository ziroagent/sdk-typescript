import type { LanguageModel } from '@ziro-agent/core';
import { GoogleGenerativeModel, type GoogleGenerativeModelId } from './google-generative-model.js';

export interface GoogleProviderOptions {
  /** Defaults to `process.env.GOOGLE_GENERATIVE_AI_API_KEY` (or `GEMINI_API_KEY`). */
  apiKey?: string;
  /** Defaults to `https://generativelanguage.googleapis.com/v1beta`. */
  baseURL?: string;
  /** Extra headers (e.g. for Vertex OAuth bearer auth). */
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface GoogleProvider {
  (modelId: GoogleGenerativeModelId): LanguageModel;
  generative(modelId: GoogleGenerativeModelId): LanguageModel;
}

export function createGoogle(options: GoogleProviderOptions = {}): GoogleProvider {
  const apiKey =
    options.apiKey ?? loadEnv('GOOGLE_GENERATIVE_AI_API_KEY') ?? loadEnv('GEMINI_API_KEY');
  const baseURL = options.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta';
  const fetcher = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const make = (modelId: GoogleGenerativeModelId): LanguageModel =>
    new GoogleGenerativeModel({
      modelId,
      baseURL,
      apiKey,
      headers,
      fetcher,
    });

  const provider = ((modelId: GoogleGenerativeModelId) => make(modelId)) as GoogleProvider;
  provider.generative = make;
  return provider;
}

export const google: GoogleProvider = createGoogle();

function loadEnv(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  return undefined;
}
