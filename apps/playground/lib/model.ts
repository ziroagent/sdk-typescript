import type { LanguageModel } from '@ziroagent/core';
import { createAnthropic } from '@ziroagent/anthropic';
import { createOpenAI } from '@ziroagent/openai';

/**
 * Resolve the model from environment variables on every request. The
 * playground intentionally keeps this dynamic so users can flip providers
 * during a dev session without restarting the server.
 */
export function resolveModel(): LanguageModel {
  const provider = (process.env.ZIRO_PROVIDER ?? 'openai').toLowerCase();
  const modelId = process.env.ZIRO_MODEL ?? defaultModelFor(provider);

  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set.');
    }
    return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(modelId);
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set.');
  }
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(modelId);
}

function defaultModelFor(provider: string): string {
  if (provider === 'anthropic') return 'claude-3-5-sonnet-latest';
  return 'gpt-4o-mini';
}
