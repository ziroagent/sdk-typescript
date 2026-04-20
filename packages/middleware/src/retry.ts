/**
 * `retry()` — re-issue `doGenerate` / `doStream` on transient failures.
 *
 * Designed for the LLM call layer where most failures are network blips
 * or 5xx responses. By default it retries `APICallError` with an HTTP
 * status in the retryable set (408, 425, 429, 500, 502, 503, 504),
 * with full jittered exponential backoff. Override `isRetryable` to
 * widen or narrow the set.
 *
 * Backoff uses {@link https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/ "Full Jitter"}:
 *   `delay = random(0, baseMs * 2 ** attempt)` capped at `maxDelayMs`.
 *
 * `wrapStream` retries ONLY when the upstream `doStream()` rejects
 * BEFORE returning the stream. Once the stream is open we cannot
 * retry without losing already-emitted chunks.
 *
 * @example
 * ```ts
 * import { retry } from '@ziro-agent/middleware';
 * import { wrapModel } from '@ziro-agent/core';
 *
 * const robust = wrapModel(openai('gpt-4o-mini'), retry({ maxAttempts: 4 }));
 * ```
 */
import {
  APICallError,
  type LanguageModelMiddleware,
  type ModelGenerateResult,
  type ModelStreamPart,
} from '@ziro-agent/core';

export interface RetryOptions {
  /** Total attempts INCLUDING the first (so `1` = no retries). Default `3`. */
  maxAttempts?: number;
  /** Initial backoff base (ms). Default `200`. */
  baseDelayMs?: number;
  /** Maximum single delay (ms). Default `30_000`. */
  maxDelayMs?: number;
  /**
   * Predicate: should we retry this error? Default = any
   * {@link APICallError} whose `isRetryable` is `true` (which already
   * encodes the standard retryable HTTP status set, plus network
   * errors with no status). Override to widen — e.g. retry timeouts.
   */
  isRetryable?: (err: unknown, attempt: number) => boolean;
  /** Optional sink for retry events (test injection / observability). */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  /**
   * Override the random source — useful in tests for deterministic
   * delays. Returns a number in `[0, 1)` like `Math.random`.
   */
  random?: () => number;
  /**
   * Override sleep — useful in tests with `vi.useFakeTimers()`. Default
   * uses `setTimeout`. The override must respect the `signal` to
   * cooperate with `params.abortSignal`.
   */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const defaultIsRetryable = (err: unknown): boolean => {
  return err instanceof APICallError && err.isRetryable;
};

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
};

export function retry(options: RetryOptions = {}): LanguageModelMiddleware {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  const computeDelay = (attempt: number): number => {
    // Full Jitter: random(0, base * 2 ** attempt) capped at maxDelay.
    const expCap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    return Math.floor(random() * expCap);
  };

  const runWithRetry = async <T>(
    fn: () => Promise<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const isLast = attempt === maxAttempts - 1;
        if (isLast || !isRetryable(err, attempt)) throw err;
        const delayMs = computeDelay(attempt);
        options.onRetry?.({ attempt, delayMs, error: err });
        await sleep(delayMs, signal);
      }
    }
    // Unreachable — the loop either returns or throws.
    throw lastErr;
  };

  return {
    middlewareId: 'retry/exponential',

    async wrapGenerate({ doGenerate, params }): Promise<ModelGenerateResult> {
      return runWithRetry(doGenerate, params.abortSignal);
    },

    async wrapStream({ doStream, params }): Promise<ReadableStream<ModelStreamPart>> {
      // We can only retry the act of OPENING the stream — once chunks
      // start flowing, restarting would re-deliver text the caller
      // already consumed. Errors emitted as `{type:'error'}` parts
      // therefore bypass retry on purpose.
      return runWithRetry(doStream, params.abortSignal);
    },
  };
}
