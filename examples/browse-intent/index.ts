/**
 * Cookbook: `browse(url, intent)` as a **thin agent** — one `createAgent` loop with
 * `browser_goto` + `browser_screenshot` (RFC 0013). Uses **stub** `BrowserAdapter`
 * (no Playwright) so you can run without Browserbase; swap for
 * `connectBrowserbasePlaywrightPage` + `createPlaywrightBrowserAdapter` for real pages.
 */
import { createAgent } from '@ziro-agent/agent';
import { createStubBrowserAdapter } from '@ziro-agent/core';
import { createOpenAI } from '@ziro-agent/openai';
import { createBrowserGotoTool, createBrowserScreenshotTool } from '@ziro-agent/tools';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running this example.');
  process.exit(1);
}

const openai = createOpenAI({ apiKey });
const { adapter: browser } = createStubBrowserAdapter();

const agent = createAgent({
  model: openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini'),
  tools: {
    browser_goto: createBrowserGotoTool({ browser }),
    browser_screenshot: createBrowserScreenshotTool({ browser }),
  },
  maxSteps: 10,
  system:
    'You control a (possibly stub) browser. Use browser_goto to open URLs and ' +
    'browser_screenshot if you need a PNG. Summarize what you learned for the user.',
});

const intent =
  process.argv.slice(2).join(' ').trim() ||
  'Open https://example.com and briefly describe the page.';

const result = await agent.run({
  prompt: intent,
  approver: async () => ({ decision: 'approve' }),
  onEvent: (e) => {
    if (e.type === 'tool-result') {
      console.log(
        `[tool] ${e.result.toolName}`,
        e.result.isError ? '(error)' : '→',
        e.result.result,
      );
    }
  },
});

console.log('\n--- final ---\n');
console.log(result.text);
console.log('\nfinishReason:', result.finishReason);
