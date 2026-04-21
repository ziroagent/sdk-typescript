# @ziro-agent/browser-browserbase

Connects [Playwright `chromium`](https://playwright.dev) to a [Browserbase](https://www.browserbase.com) session over CDP, then reuse [`createPlaywrightBrowserAdapter`](https://github.com/ziroagent/sdk-typescript/tree/main/packages/browser-playwright) and `@ziro-agent/tools` browser primitives.

## Install

```bash
pnpm add @ziro-agent/browser-browserbase @browserbasehq/sdk playwright-core
```

Set **`BROWSERBASE_API_KEY`** (and **`BROWSERBASE_PROJECT_ID`** if your account requires it on create).

## Usage

```ts
import { createBrowserGotoTool } from '@ziro-agent/tools';
import { createPlaywrightBrowserAdapter } from '@ziro-agent/browser-playwright';
import { connectBrowserbasePlaywrightPage } from '@ziro-agent/browser-browserbase';

const { page, dispose } = await connectBrowserbasePlaywrightPage({});
try {
  const goto = createBrowserGotoTool({
    browser: createPlaywrightBrowserAdapter(page),
  });
  // …
} finally {
  await dispose();
}
```

See [Browserbase + Playwright quickstart](https://docs.browserbase.com/welcome/quickstarts/playwright).
