import type { BrowserAdapter, BrowserNavigateOptions } from '@ziro-agent/core';
import type { Page } from 'playwright';

async function runWithOptionalAbort<T>(start: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return start();
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    start().then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Wraps a Playwright {@link Page} as a {@link BrowserAdapter} for
 * `createBrowserGotoTool` / `createBrowserScreenshotTool` in `@ziro-agent/tools`.
 *
 * Text entry uses {@link Page.fill} (same selector contract as `type` on the adapter).
 *
 * `AbortSignal` is honored by racing the Playwright call (Playwright versions in the
 * v1.4x line do not accept `signal` on every primitive).
 */
export function createPlaywrightBrowserAdapter(page: Page): BrowserAdapter {
  return {
    kind: 'playwright',
    async goto(url: string, options?: BrowserNavigateOptions): Promise<void> {
      await runWithOptionalAbort(
        () =>
          page.goto(url, {
            waitUntil: options?.waitUntil ?? 'load',
          }),
        options?.signal,
      );
    },
    async click(selector: string, options?: { signal?: AbortSignal }): Promise<void> {
      await runWithOptionalAbort(() => page.click(selector), options?.signal);
    },
    async type(selector: string, text: string, options?: { signal?: AbortSignal }): Promise<void> {
      await runWithOptionalAbort(() => page.fill(selector, text), options?.signal);
    },
    async screenshot(options?: { signal?: AbortSignal }): Promise<Uint8Array> {
      const buf = await runWithOptionalAbort(
        () =>
          page.screenshot({
            type: 'png',
          }),
        options?.signal,
      );
      return new Uint8Array(buf);
    },
    async evaluate<T>(snippet: string): Promise<T> {
      return page.evaluate(snippet as never) as Promise<T>;
    },
    async close(): Promise<void> {
      await page.close();
    },
  };
}
