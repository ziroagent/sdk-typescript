import Browserbase from '@browserbasehq/sdk';
import type { Browser, Page } from 'playwright-core';
import { chromium } from 'playwright-core';

type BrowserbaseClient = InstanceType<typeof Browserbase>;

export interface ConnectBrowserbasePlaywrightPageOptions {
  /** Re-use an existing Browserbase client. */
  client?: BrowserbaseClient;
  /** Defaults to `process.env.BROWSERBASE_API_KEY`. */
  apiKey?: string;
  /** Optional project id when not inferred from the API key. */
  projectId?: string;
  /** Extra fields forwarded to [`sessions.create`](https://docs.browserbase.com/reference/sdk/nodejs). */
  sessionCreate?: Record<string, unknown>;
}

/**
 * Creates a Browserbase session and connects Playwright over CDP.
 * Pass {@link Page} to {@link createPlaywrightBrowserAdapter} from `@ziro-agent/browser-playwright`,
 * then to `createBrowserGotoTool` / `createBrowserScreenshotTool` from `@ziro-agent/tools`.
 */
export async function connectBrowserbasePlaywrightPage(
  options: ConnectBrowserbasePlaywrightPageOptions,
): Promise<{
  page: Page;
  browser: Browser;
  session: { id: string; connectUrl: string };
  dispose: () => Promise<void>;
}> {
  const apiKey = options.apiKey ?? process.env.BROWSERBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Browserbase API key missing: pass options.apiKey or set BROWSERBASE_API_KEY.');
  }
  const client = options.client ?? new Browserbase({ apiKey });
  const createBody =
    options.projectId !== undefined || options.sessionCreate !== undefined
      ? {
          ...options.sessionCreate,
          ...(options.projectId !== undefined ? { projectId: options.projectId } : {}),
        }
      : undefined;
  const session = await client.sessions.create(createBody);
  if (!session.connectUrl) {
    throw new Error('Browserbase session did not return connectUrl.');
  }
  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    page,
    browser,
    session: { id: session.id, connectUrl: session.connectUrl },
    dispose: async () => {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
