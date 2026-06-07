import { describe, expect, it } from 'vitest';
import { type APICallError, isAPICallError, parseRetryAfterMs, TimeoutError } from '../errors.js';
import { providerFetch, redactQueryKey } from './provider-fetch.js';

const fetcherReturning = (res: Response): typeof fetch =>
  (async () => res) as unknown as typeof fetch;

describe('parseRetryAfterMs', () => {
  it('parses delta-seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });
  it('parses an HTTP-date into a future delta', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(2000);
    expect(ms).toBeLessThanOrEqual(5000);
  });
  it('returns undefined for missing / unparseable values', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs('   ')).toBeUndefined();
    expect(parseRetryAfterMs('garbage')).toBeUndefined();
  });
});

describe('redactQueryKey', () => {
  it('redacts a key query param', () => {
    expect(redactQueryKey('https://h/p?key=SECRET')).toBe('https://h/p?key=REDACTED');
    expect(redactQueryKey('https://h/p?a=1&key=SECRET&b=2')).toBe(
      'https://h/p?a=1&key=REDACTED&b=2',
    );
  });
  it('leaves url without a key untouched', () => {
    expect(redactQueryKey('https://h/p?a=1')).toBe('https://h/p?a=1');
  });
});

describe('providerFetch', () => {
  it('returns the response on success', async () => {
    const res = await providerFetch({
      fetcher: fetcherReturning(new Response('ok', { status: 200 })),
      url: 'https://x/y',
      init: {},
      providerLabel: 'X',
    });
    expect(res.status).toBe(200);
  });

  it('wraps a network error as a retryable APICallError', async () => {
    const fetcher = (async () => {
      throw new TypeError('ECONNRESET');
    }) as unknown as typeof fetch;
    let err: unknown;
    try {
      await providerFetch({ fetcher, url: 'https://x/y', init: {}, providerLabel: 'X' });
    } catch (e) {
      err = e;
    }
    expect(isAPICallError(err)).toBe(true);
    expect((err as APICallError).isRetryable).toBe(true);
  });

  it('captures Retry-After into retryAfterMs on a 429', async () => {
    const res = new Response('rate', { status: 429, headers: { 'retry-after': '2' } });
    let err: unknown;
    try {
      await providerFetch({
        fetcher: fetcherReturning(res),
        url: 'https://x',
        init: {},
        providerLabel: 'X',
      });
    } catch (e) {
      err = e;
    }
    expect(isAPICallError(err)).toBe(true);
    expect((err as APICallError).retryAfterMs).toBe(2000);
    expect((err as APICallError).statusCode).toBe(429);
  });

  it('redacts a query-string key in the thrown error url', async () => {
    const res = new Response('no', { status: 500 });
    let err: APICallError | undefined;
    try {
      await providerFetch({
        fetcher: fetcherReturning(res),
        url: 'https://x?key=SECRET&m=1',
        init: {},
        providerLabel: 'X',
        redactUrl: redactQueryKey,
      });
    } catch (e) {
      err = e as APICallError;
    }
    expect(err?.url).toBe('https://x?key=REDACTED&m=1');
  });

  it('times out a hung request as a TimeoutError', async () => {
    const fetcher = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      })) as unknown as typeof fetch;
    await expect(
      providerFetch({ fetcher, url: 'https://x', init: {}, providerLabel: 'X', timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('re-throws a caller abort verbatim (not wrapped)', async () => {
    const ac = new AbortController();
    ac.abort();
    const fetcher = ((_url: string, init?: RequestInit) =>
      Promise.reject(
        init?.signal?.reason ?? new DOMException('aborted', 'AbortError'),
      )) as unknown as typeof fetch;
    let err: unknown;
    try {
      await providerFetch({
        fetcher,
        url: 'https://x',
        init: {},
        providerLabel: 'X',
        abortSignal: ac.signal,
      });
    } catch (e) {
      err = e;
    }
    expect(isAPICallError(err)).toBe(false);
  });
});
