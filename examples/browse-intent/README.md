# Example: browse with intent (stub browser)

Implements the RFC 0013 **“browse(url, intent)”** pattern as a **single agent** with `browser_goto` + `browser_screenshot`. The default **stub** adapter does not load real pages; the model still sees tool results (stub stdout / tiny PNG prefix).

```bash
pnpm --filter @ziro-agent/example-browse-intent start -- "Open https://example.com and summarize"
```

**Real browser:** install `@ziro-agent/browser-browserbase`, `@browserbasehq/sdk`, `playwright-core`, then replace `createStubBrowserAdapter()` with:

```ts
import { connectBrowserbasePlaywrightPage } from '@ziro-agent/browser-browserbase';
import { createPlaywrightBrowserAdapter } from '@ziro-agent/browser-playwright';

const { page, dispose } = await connectBrowserbasePlaywrightPage({});
try {
  const browser = createPlaywrightBrowserAdapter(page);
  // createBrowserGotoTool({ browser }), …
} finally {
  await dispose();
}
```
