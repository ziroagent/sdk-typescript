/**
 * `modelFallback()` — try the wrapped primary model first; on recoverable
 * errors, call each {@link LanguageModel} in `fallbacks` in order (RFC 0015).
 *
 * Pairs with {@link wrapModel} from `@ziro-agent/core`. For a single composed
 * `LanguageModel` without middleware ordering concerns, prefer
 * {@link withFallbackChain} on `@ziro-agent/core`.
 */
import {
  APICallError,
  type LanguageModel,
  type LanguageModelMiddleware,
  type ModelCallOptions,
  type ModelGenerateResult,
  type ModelStreamPart,
  TimeoutError,
} from '@ziro-agent/core';

export interface ModelFallbackCircuitBreakerOptions {
  /**
   * After this many **consecutive** recoverable primary failures that reached
   * the fallback path, the primary is skipped until {@link resetMs} elapses.
   * Minimum effective value is `1`.
   */
  failureThreshold: number;
  /** How long the primary stays bypassed after the threshold is hit (ms). */
  resetMs: number;
}

export interface ModelFallbackOptions {
  /** Models to try after the wrapped primary fails. */
  fallbacks: readonly LanguageModel[];
  /**
   * Return true to try the next fallback. Defaults to retryable
   * {@link APICallError} and {@link TimeoutError}.
   */
  shouldFallback?: (error: unknown) => boolean;
  /** Optional observability hook (tests, OTel bridges). */
  onFallback?: (info: {
    attempt: number;
    fromModelId: string;
    toModelId: string;
    error: unknown;
  }) => void;
  /**
   * When set, consecutive recoverable failures on the primary open a short
   * window where `doGenerate` / `doStream` is skipped and fallbacks run first.
   */
  circuitBreaker?: ModelFallbackCircuitBreakerOptions;
}

function defaultShouldFallback(error: unknown): boolean {
  if (error instanceof APICallError) return error.isRetryable;
  if (error instanceof TimeoutError) return true;
  return false;
}

interface CircuitEntry {
  consecutivePrimaryFailures: number;
  /** Primary is bypassed while `Date.now() < openUntil`. */
  openUntil: number;
}

const circuitStore = new Map<string, CircuitEntry>();

function circuitKey(model: LanguageModel): string {
  return `${model.provider}\u0000${model.modelId}`;
}

function effectiveThreshold(cb: ModelFallbackCircuitBreakerOptions): number {
  return Math.max(1, cb.failureThreshold);
}

function readCircuit(key: string, now: number): CircuitEntry | undefined {
  const e = circuitStore.get(key);
  if (!e) return undefined;
  if (e.openUntil > 0 && now >= e.openUntil) {
    circuitStore.delete(key);
    return undefined;
  }
  return e;
}

function isCircuitOpen(
  model: LanguageModel,
  _cb: ModelFallbackCircuitBreakerOptions,
  now: number,
): boolean {
  const e = readCircuit(circuitKey(model), now);
  if (!e) return false;
  return e.openUntil > 0 && now < e.openUntil;
}

function recordPrimaryFallbackFailure(
  model: LanguageModel,
  cb: ModelFallbackCircuitBreakerOptions,
  now: number,
): void {
  const key = circuitKey(model);
  const prev = readCircuit(key, now);
  const consecutivePrimaryFailures = (prev?.consecutivePrimaryFailures ?? 0) + 1;
  const openUntil =
    consecutivePrimaryFailures >= effectiveThreshold(cb) ? now + Math.max(0, cb.resetMs) : 0;
  circuitStore.set(key, { consecutivePrimaryFailures, openUntil });
}

function clearCircuit(model: LanguageModel): void {
  circuitStore.delete(circuitKey(model));
}

/**
 * Clears all {@link ModelFallbackOptions.circuitBreaker} state. Intended for
 * tests; production servers rarely need this.
 */
export function resetModelFallbackCircuitState(): void {
  circuitStore.clear();
}

async function tryFallbackGenerates(
  fallbacks: readonly LanguageModel[],
  params: ModelCallOptions,
  shouldFallback: (e: unknown) => boolean,
  onFallback:
    | ((info: { attempt: number; fromModelId: string; toModelId: string; error: unknown }) => void)
    | undefined,
  fromModelId: string,
  firstError: unknown,
): Promise<ModelGenerateResult> {
  let lastErr: unknown = firstError;
  if (fallbacks.length === 0 || !shouldFallback(firstError)) {
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
  for (let i = 0; i < fallbacks.length; i++) {
    const fb = fallbacks[i];
    if (!fb) continue;
    onFallback?.({
      attempt: i + 1,
      fromModelId,
      toModelId: fb.modelId,
      error: lastErr,
    });
    try {
      return await fb.generate(params);
    } catch (e) {
      lastErr = e;
      const more = i < fallbacks.length - 1;
      if (!more || !shouldFallback(e))
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Try every fallback in order (used when the primary circuit is open). */
async function tryFallbackGeneratesForced(
  fallbacks: readonly LanguageModel[],
  params: ModelCallOptions,
  onFallback:
    | ((info: { attempt: number; fromModelId: string; toModelId: string; error: unknown }) => void)
    | undefined,
  fromModelId: string,
  syntheticReason: unknown,
): Promise<ModelGenerateResult> {
  if (fallbacks.length === 0) {
    throw syntheticReason instanceof Error ? syntheticReason : new Error(String(syntheticReason));
  }
  let lastErr: unknown = syntheticReason;
  for (let i = 0; i < fallbacks.length; i++) {
    const fb = fallbacks[i];
    if (!fb) continue;
    onFallback?.({
      attempt: i + 1,
      fromModelId,
      toModelId: fb.modelId,
      error: lastErr,
    });
    try {
      return await fb.generate(params);
    } catch (e) {
      lastErr = e;
      if (i === fallbacks.length - 1)
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function tryFallbackStreams(
  fallbacks: readonly LanguageModel[],
  params: ModelCallOptions,
  shouldFallback: (e: unknown) => boolean,
  onFallback:
    | ((info: { attempt: number; fromModelId: string; toModelId: string; error: unknown }) => void)
    | undefined,
  fromModelId: string,
  firstError: unknown,
): Promise<ReadableStream<ModelStreamPart>> {
  let lastErr: unknown = firstError;
  if (fallbacks.length === 0 || !shouldFallback(firstError)) {
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
  for (let i = 0; i < fallbacks.length; i++) {
    const fb = fallbacks[i];
    if (!fb) continue;
    onFallback?.({
      attempt: i + 1,
      fromModelId,
      toModelId: fb.modelId,
      error: lastErr,
    });
    try {
      return await fb.stream(params);
    } catch (e) {
      lastErr = e;
      const more = i < fallbacks.length - 1;
      if (!more || !shouldFallback(e))
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function tryFallbackStreamsForced(
  fallbacks: readonly LanguageModel[],
  params: ModelCallOptions,
  onFallback:
    | ((info: { attempt: number; fromModelId: string; toModelId: string; error: unknown }) => void)
    | undefined,
  fromModelId: string,
  syntheticReason: unknown,
): Promise<ReadableStream<ModelStreamPart>> {
  if (fallbacks.length === 0) {
    throw syntheticReason instanceof Error ? syntheticReason : new Error(String(syntheticReason));
  }
  let lastErr: unknown = syntheticReason;
  for (let i = 0; i < fallbacks.length; i++) {
    const fb = fallbacks[i];
    if (!fb) continue;
    onFallback?.({
      attempt: i + 1,
      fromModelId,
      toModelId: fb.modelId,
      error: lastErr,
    });
    try {
      return await fb.stream(params);
    } catch (e) {
      lastErr = e;
      if (i === fallbacks.length - 1)
        throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function modelFallback(options: ModelFallbackOptions): LanguageModelMiddleware {
  const fallbacks = options.fallbacks;
  const shouldFallback = options.shouldFallback ?? defaultShouldFallback;
  const onFallback = options.onFallback;
  const cb = options.circuitBreaker;

  return {
    middlewareId: 'resilience/model-fallback',

    async wrapGenerate({ doGenerate, params, model }) {
      const now = Date.now();
      const circuitOpen = cb ? isCircuitOpen(model, cb, now) : false;

      if (!circuitOpen) {
        try {
          const r = await doGenerate();
          clearCircuit(model);
          return r;
        } catch (err) {
          if (fallbacks.length > 0 && shouldFallback(err) && cb) {
            recordPrimaryFallbackFailure(model, cb, Date.now());
          }
          if (fallbacks.length === 0 || !shouldFallback(err)) throw err;
          return await tryFallbackGenerates(
            fallbacks,
            params,
            shouldFallback,
            onFallback,
            model.modelId,
            err,
          );
        }
      }

      const r = await tryFallbackGeneratesForced(
        fallbacks,
        params,
        onFallback,
        model.modelId,
        new Error('ziro.model.fallback: primary circuit open'),
      );
      clearCircuit(model);
      return r;
    },

    async wrapStream({ doStream, params, model }) {
      const now = Date.now();
      const circuitOpen = cb ? isCircuitOpen(model, cb, now) : false;

      if (!circuitOpen) {
        try {
          const r = await doStream();
          clearCircuit(model);
          return r;
        } catch (err) {
          if (fallbacks.length > 0 && shouldFallback(err) && cb) {
            recordPrimaryFallbackFailure(model, cb, Date.now());
          }
          if (fallbacks.length === 0 || !shouldFallback(err)) throw err;
          return await tryFallbackStreams(
            fallbacks,
            params,
            shouldFallback,
            onFallback,
            model.modelId,
            err,
          );
        }
      }

      const r = await tryFallbackStreamsForced(
        fallbacks,
        params,
        onFallback,
        model.modelId,
        new Error('ziro.model.fallback: primary circuit open'),
      );
      clearCircuit(model);
      return r;
    },
  };
}
