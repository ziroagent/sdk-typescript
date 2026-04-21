# @ziro-agent/browser-playwright

Maps a Playwright [`Page`](https://playwright.dev/docs/api/class-page) to ZiroAgent [`BrowserAdapter`](https://github.com/ziroagent/sdk-typescript) for use with `createBrowserGotoTool()` / `createBrowserScreenshotTool()` from `@ziro-agent/tools`.

## Install

```bash
pnpm add @ziro-agent/browser-playwright playwright @ziro-agent/core
```

## Usage

```ts
import { chromium } from 'playwright';
import { createBrowserGotoTool } from '@ziro-agent/tools';
import { createPlaywrightBrowserAdapter } from '@ziro-agent/browser-playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const gotoTool = createBrowserGotoTool({
  browser: createPlaywrightBrowserAdapter(page),
});
```
