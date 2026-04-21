import type { BrowserAdapter, BrowserNavigateOptions } from './types.js';

export interface StubBrowserAdapterResult {
  readonly adapter: BrowserAdapter;
  /** URLs passed to {@link BrowserAdapter.goto} in order. */
  getVisited(): readonly string[];
}

/**
 * Records `goto` URLs and returns a tiny byte prefix from `screenshot()` — for
 * tests only; not a real browser.
 */
export function createStubBrowserAdapter(): StubBrowserAdapterResult {
  const visited: string[] = [];
  const adapter: BrowserAdapter = {
    kind: 'stub',
    async goto(url: string, _options?: BrowserNavigateOptions): Promise<void> {
      visited.push(url);
    },
    async screenshot(): Promise<Uint8Array> {
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    },
  };
  return {
    adapter,
    getVisited: () => visited,
  };
}
