import type { BrowserAdapter } from '@ziro-agent/core';
import { InvalidArgumentError } from '@ziro-agent/core';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';

function uint8ToBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.byteLength; i++) s += String.fromCharCode(arr[i] as number);
  return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

const gotoInput = z.object({
  url: z.string().url(),
});

export interface CreateBrowserGotoToolOptions {
  browser: BrowserAdapter;
  name?: string;
  description?: string;
}

/**
 * `browser.goto` as an agent tool — low-level primitive per RFC 0013.
 */
export function createBrowserGotoTool(options: CreateBrowserGotoToolOptions) {
  const { browser, name = 'browser_goto', description } = options;
  return defineTool({
    name,
    description:
      description ??
      'Open a URL in the automated browser session (Playwright, Browserbase, or custom BrowserAdapter).',
    input: gotoInput,
    mutates: true,
    async execute(input, ctx) {
      await browser.goto(input.url, { signal: ctx.abortSignal });
      return { ok: true as const };
    },
  });
}

const screenshotInput = z.object({});

const screenshotOutput = z.object({
  base64: z.string(),
  mimeType: z.literal('image/png'),
});

export interface CreateBrowserScreenshotToolOptions {
  browser: BrowserAdapter;
  name?: string;
  description?: string;
}

/**
 * PNG screenshot of the current page. Requires `browser.screenshot`.
 */
export function createBrowserScreenshotTool(options: CreateBrowserScreenshotToolOptions) {
  const { browser, name = 'browser_screenshot', description } = options;
  return defineTool({
    name,
    description:
      description ??
      'Capture a PNG screenshot of the current browser page. The adapter must implement `screenshot()`.',
    input: screenshotInput,
    output: screenshotOutput,
    mutates: true,
    async execute(_input, ctx) {
      if (browser.screenshot === undefined) {
        throw new InvalidArgumentError({
          argument: 'browser',
          message: 'BrowserAdapter.screenshot is not implemented for this adapter.',
        });
      }
      const png = await browser.screenshot({ signal: ctx.abortSignal });
      return { base64: uint8ToBase64(png), mimeType: 'image/png' as const };
    },
  });
}
