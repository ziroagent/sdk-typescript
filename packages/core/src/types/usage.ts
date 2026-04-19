/**
 * Token usage reported by a provider. Providers should populate every field
 * they have data for; missing fields should be `undefined` rather than `0`.
 */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Some providers (Anthropic, OpenAI) expose cached prompt tokens. */
  cachedPromptTokens?: number;
  /** Reasoning tokens (OpenAI o1+, Anthropic extended thinking). */
  reasoningTokens?: number;
}

export const emptyUsage = (): TokenUsage => ({});

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const sum = (x?: number, y?: number): number | undefined => {
    if (x === undefined && y === undefined) return undefined;
    return (x ?? 0) + (y ?? 0);
  };
  return {
    promptTokens: sum(a.promptTokens, b.promptTokens),
    completionTokens: sum(a.completionTokens, b.completionTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
    cachedPromptTokens: sum(a.cachedPromptTokens, b.cachedPromptTokens),
    reasoningTokens: sum(a.reasoningTokens, b.reasoningTokens),
  };
}
