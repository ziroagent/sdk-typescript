import { APICallError, TimeoutError } from '../errors.js';
import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from '../types/model.js';
export interface FallbackChainOptions {
  /**
   * Return true to try the next model in the chain. Defaults to retryable
   * {@link APICallError} and {@link TimeoutError}.
   */
  shouldFallback?: (error: unknown) => boolean;
}

function defaultShouldFallback(error: unknown): boolean {
  if (error instanceof APICallError) return error.isRetryable;
  if (error instanceof TimeoutError) return true;
  return false;
}

/**
 * Wraps a non-empty list of models: `generate` / `stream` try the first
 * model, then the next on recoverable failures (see {@link FallbackChainOptions}).
 *
 * v0.6 resilience slice — static ordering only; no adaptive routing (RFC 0015).
 */
export function withFallbackChain(
  models: readonly [LanguageModel, ...LanguageModel[]],
  options?: FallbackChainOptions,
): LanguageModel {
  const shouldFallback = options?.shouldFallback ?? defaultShouldFallback;
  const [primary, ...rest] = models;
  const chain = [primary, ...rest] as readonly LanguageModel[];

  const modelId = chain.map((m) => m.modelId).join('||');
  const provider = `fallback:${chain[0]?.provider ?? 'unknown'}`;

  const pickEstimateCost = (): LanguageModel['estimateCost'] => {
    for (const m of chain) {
      if (m.estimateCost) return m.estimateCost.bind(m);
    }
    return undefined;
  };

  const estimateCost = pickEstimateCost();

  return {
    modelId,
    provider,
    ...(estimateCost ? { estimateCost } : {}),

    async generate(opts: ModelCallOptions): Promise<ModelGenerateResult> {
      let lastErr: unknown;
      for (let i = 0; i < chain.length; i++) {
        const m = chain[i];
        if (!m) continue;
        try {
          return await m.generate(opts);
        } catch (err) {
          lastErr = err;
          const more = i < chain.length - 1;
          if (!more || !shouldFallback(err)) throw err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    },

    async stream(opts: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>> {
      let lastErr: unknown;
      for (let i = 0; i < chain.length; i++) {
        const m = chain[i];
        if (!m) continue;
        try {
          return await m.stream(opts);
        } catch (err) {
          lastErr = err;
          const more = i < chain.length - 1;
          if (!more || !shouldFallback(err)) throw err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    },
  };
}
