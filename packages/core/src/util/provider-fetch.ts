import { APICallError, parseRetryAfterMs, TimeoutError } from '../errors.js';

export interface ProviderFetchOptions {
  /** The injected `fetch` implementation (allows test doubles / proxies). */
  fetcher: typeof fetch;
  /** Fully-qualified request URL. */
  url: string;
  /** Request init (method/headers/body). The signal is managed here. */
  init: RequestInit;
  /** Human label used in error messages, e.g. `"OpenAI"`. */
  providerLabel: string;
  /** Caller's abort signal, if any. Composed with the timeout signal. */
  abortSignal?: AbortSignal;
  /**
   * Default request timeout in milliseconds. A hung socket otherwise hangs
   * forever — providers historically forwarded only the caller's signal and
   * had NO default timeout. `0`/`undefined` disables.
   */
  timeoutMs?: number;
  /**
   * Strip secrets (e.g. an API key in the query string) from the URL before it
   * is stored on a thrown {@link APICallError}. Without this a Gemini key in
   * `?key=...` leaks to anyone who logs `error.url`.
   */
  redactUrl?: (url: string) => string;
}

/**
 * Shared HTTP layer for the LLM providers. Centralises the production-hardening
 * that each provider previously lacked or implemented inconsistently:
 *
 *  - **Default timeout** via a composed `AbortSignal` (was: none).
 *  - **Network errors wrapped** as a retryable {@link APICallError} so the
 *    retry middleware actually retries them (was: raw `TypeError` bypassed it).
 *  - **`Retry-After` captured** into `APICallError.retryAfterMs` so retry can
 *    honour server backoff (was: header discarded).
 *  - **URL redaction** so query-string secrets never reach `error.url`.
 *
 * Timeout aborts surface as {@link TimeoutError}; a caller-initiated abort is
 * re-thrown verbatim (it is not an SDK error).
 */
export async function providerFetch(opts: ProviderFetchOptions): Promise<Response> {
  const { fetcher, url, init, providerLabel, abortSignal, timeoutMs, redactUrl } = opts;
  const safeUrl = redactUrl ? redactUrl(url) : url;

  let timeoutSignal: AbortSignal | undefined;
  if (timeoutMs !== undefined && timeoutMs > 0) {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
  }
  const signals = [abortSignal, timeoutSignal].filter((s): s is AbortSignal => s !== undefined);
  const finalInit: RequestInit = { ...init };
  if (signals.length === 1) finalInit.signal = signals[0];
  else if (signals.length > 1) finalInit.signal = AbortSignal.any(signals);

  let res: Response;
  try {
    res = await fetcher(url, finalInit);
  } catch (err) {
    if (timeoutSignal?.aborted && !abortSignal?.aborted) {
      throw new TimeoutError(timeoutMs as number);
    }
    if (abortSignal?.aborted) throw err; // user cancellation — surface verbatim
    // Network-level failure (DNS, connection reset, TLS handshake). Retryable.
    throw new APICallError({
      message: `${providerLabel} request failed: ${err instanceof Error ? err.message : String(err)}`,
      url: safeUrl,
      isRetryable: true,
      cause: err,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
    throw new APICallError({
      message: `${providerLabel} API error: ${res.status} ${res.statusText}`,
      url: safeUrl,
      statusCode: res.status,
      responseBody: text,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });
  }
  return res;
}

/** Redact a `key=...` query-string secret (Gemini) from a URL for error logs. */
export function redactQueryKey(url: string): string {
  return url.replace(/([?&]key=)[^&]*/gi, '$1REDACTED');
}
