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

export interface ModelFallbackAdaptiveOptions {
  /**
   * How to rank `fallbacks` before each chain walk.
   * - `success_ratio` — prefer models with more historical successes.
   * - `latency` — prefer lower median-ish average latency on successes.
   */
  mode?: 'success_ratio' | 'latency';
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
  /**
   * Re-order `fallbacks` using lightweight in-process stats so healthier models
   * are tried first after the primary fails (RFC 0015 — adaptive routing).
   */
  adaptive?: boolean | ModelFallbackAdaptiveOptions;
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

interface AdaptiveEntry {
  successes: number;
  failures: number;
  totalLatencyMs: number;
  latencySamples: number;
}

const adaptiveStore = new Map<string, AdaptiveEntry>();

function readAdaptive(id: string): AdaptiveEntry {
  let e = adaptiveStore.get(id);
  if (!e) {
    e = { successes: 0, failures: 0, totalLatencyMs: 0, latencySamples: 0 };
    adaptiveStore.set(id, e);
  }
  return e;
}

function recordAdaptiveSuccess(id: string, latencyMs: number): void {
  const e = readAdaptive(id);
  e.successes += 1;
  e.totalLatencyMs += Math.max(0, latencyMs);
  e.latencySamples += 1;
}

function recordAdaptiveFailure(id: string): void {
  readAdaptive(id).failures += 1;
}

function successRatio(id: string): number {
  const e = adaptiveStore.get(id);
  if (!e) return 0.5;
  const t = e.successes + e.failures;
  if (t === 0) return 0.5;
  return e.successes / t;
}

function avgLatency(id: string): number {
  const e = adaptiveStore.get(id);
  if (!e || e.latencySamples === 0) return Number.POSITIVE_INFINITY;
  return e.totalLatencyMs / e.latencySamples;
}

function resolveAdaptive(
  adaptive: ModelFallbackOptions['adaptive'],
): ModelFallbackAdaptiveOptions | undefined {
  if (adaptive === true) return { mode: 'success_ratio' };
  if (adaptive && typeof adaptive === 'object') return { mode: adaptive.mode ?? 'success_ratio' };
  return undefined;
}

function orderFallbacks(
  fallbacks: readonly LanguageModel[],
  adaptive: ModelFallbackAdaptiveOptions | undefined,
): readonly LanguageModel[] {
  if (!adaptive) return fallbacks;
  const mode = adaptive.mode ?? 'success_ratio';
  const indexed = fallbacks.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => {
    let cmp = 0;
    if (mode === 'latency') cmp = avgLatency(a.m.modelId) - avgLatency(b.m.modelId);
    else cmp = successRatio(b.m.modelId) - successRatio(a.m.modelId);
    if (cmp !== 0) return cmp;
    return a.i - b.i;
  });
  return indexed.map((x) => x.m);
}

/**
 * Clears {@link ModelFallbackOptions.adaptive} ranking state. Intended for tests.
 */
export function resetModelFallbackAdaptiveState(): void {
  adaptiveStore.clear();
}

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
  adaptive: ModelFallbackAdaptiveOptions | undefined,
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
    const t0 = performance.now();
    try {
      const r = await fb.generate(params);
      if (adaptive) recordAdaptiveSuccess(fb.modelId, performance.now() - t0);
      return r;
    } catch (e) {
      if (adaptive) recordAdaptiveFailure(fb.modelId);
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
  adaptive: ModelFallbackAdaptiveOptions | undefined,
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
    const t0 = performance.now();
    try {
      const r = await fb.generate(params);
      if (adaptive) recordAdaptiveSuccess(fb.modelId, performance.now() - t0);
      return r;
    } catch (e) {
      if (adaptive) recordAdaptiveFailure(fb.modelId);
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
  adaptive: ModelFallbackAdaptiveOptions | undefined,
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
    const t0 = performance.now();
    try {
      const r = await fb.stream(params);
      if (adaptive) recordAdaptiveSuccess(fb.modelId, performance.now() - t0);
      return r;
    } catch (e) {
      if (adaptive) recordAdaptiveFailure(fb.modelId);
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
  adaptive: ModelFallbackAdaptiveOptions | undefined,
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
    const t0 = performance.now();
    try {
      const r = await fb.stream(params);
      if (adaptive) recordAdaptiveSuccess(fb.modelId, performance.now() - t0);
      return r;
    } catch (e) {
      if (adaptive) recordAdaptiveFailure(fb.modelId);
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
  const adaptiveCfg = resolveAdaptive(options.adaptive);

  return {
    middlewareId: 'resilience/model-fallback',

    async wrapGenerate({ doGenerate, params, model }) {
      const now = Date.now();
      const circuitOpen = cb ? isCircuitOpen(model, cb, now) : false;
      const ordered = orderFallbacks(fallbacks, adaptiveCfg);

      if (!circuitOpen) {
        const t0 = performance.now();
        try {
          const r = await doGenerate();
          if (adaptiveCfg) recordAdaptiveSuccess(model.modelId, performance.now() - t0);
          clearCircuit(model);
          return r;
        } catch (err) {
          if (adaptiveCfg) recordAdaptiveFailure(model.modelId);
          if (fallbacks.length > 0 && shouldFallback(err) && cb) {
            recordPrimaryFallbackFailure(model, cb, Date.now());
          }
          if (fallbacks.length === 0 || !shouldFallback(err)) throw err;
          return await tryFallbackGenerates(
            ordered,
            params,
            shouldFallback,
            onFallback,
            model.modelId,
            err,
            adaptiveCfg,
          );
        }
      }

      const r = await tryFallbackGeneratesForced(
        ordered,
        params,
        onFallback,
        model.modelId,
        new Error('ziro.model.fallback: primary circuit open'),
        adaptiveCfg,
      );
      clearCircuit(model);
      return r;
    },

    async wrapStream({ doStream, params, model }) {
      const now = Date.now();
      const circuitOpen = cb ? isCircuitOpen(model, cb, now) : false;
      const ordered = orderFallbacks(fallbacks, adaptiveCfg);

      if (!circuitOpen) {
        const t0 = performance.now();
        try {
          const r = await doStream();
          if (adaptiveCfg) recordAdaptiveSuccess(model.modelId, performance.now() - t0);
          clearCircuit(model);
          return r;
        } catch (err) {
          if (adaptiveCfg) recordAdaptiveFailure(model.modelId);
          if (fallbacks.length > 0 && shouldFallback(err) && cb) {
            recordPrimaryFallbackFailure(model, cb, Date.now());
          }
          if (fallbacks.length === 0 || !shouldFallback(err)) throw err;
          return await tryFallbackStreams(
            ordered,
            params,
            shouldFallback,
            onFallback,
            model.modelId,
            err,
            adaptiveCfg,
          );
        }
      }

      const r = await tryFallbackStreamsForced(
        ordered,
        params,
        onFallback,
        model.modelId,
        new Error('ziro.model.fallback: primary circuit open'),
        adaptiveCfg,
      );
      clearCircuit(model);
      return r;
    },
  };
}
