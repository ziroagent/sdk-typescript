import { describe, expect, it } from 'vitest';
import { connectBrowserbasePlaywrightPage } from './connect-browserbase-playwright.js';

describe('connectBrowserbasePlaywrightPage', () => {
  it('throws when no API key and no client', async () => {
    const prev = process.env.BROWSERBASE_API_KEY;
    delete process.env.BROWSERBASE_API_KEY;
    await expect(connectBrowserbasePlaywrightPage({})).rejects.toThrow(/API key missing/);
    if (prev !== undefined) process.env.BROWSERBASE_API_KEY = prev;
  });
});
