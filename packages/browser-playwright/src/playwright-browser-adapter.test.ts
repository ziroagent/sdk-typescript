import { describe, expect, it, vi } from 'vitest';
import { createPlaywrightBrowserAdapter } from './playwright-browser-adapter.js';

function mockPage(overrides: Record<string, unknown> = {}) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    evaluate: vi.fn().mockResolvedValue(42),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createPlaywrightBrowserAdapter', () => {
  it('delegates goto with waitUntil default load', async () => {
    const page = mockPage();
    const browser = createPlaywrightBrowserAdapter(page as never);
    await browser.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    expect(page.goto).toHaveBeenCalledWith('https://example.com', {
      waitUntil: 'domcontentloaded',
    });
  });

  it('delegates screenshot to PNG bytes', async () => {
    const page = mockPage();
    const browser = createPlaywrightBrowserAdapter(page as never);
    expect(browser.screenshot).toBeDefined();
    const png = await browser.screenshot();
    expect([...png]).toEqual([1, 2, 3]);
    expect(page.screenshot).toHaveBeenCalledWith({ type: 'png' });
  });

  it('delegates fill for type()', async () => {
    const page = mockPage();
    const browser = createPlaywrightBrowserAdapter(page as never);
    expect(browser.type).toBeDefined();
    await browser.type('#q', 'hello');
    expect(page.fill).toHaveBeenCalledWith('#q', 'hello');
  });

  it('closes the page on close()', async () => {
    const page = mockPage();
    const browser = createPlaywrightBrowserAdapter(page as never);
    expect(browser.close).toBeDefined();
    await browser.close();
    expect(page.close).toHaveBeenCalled();
  });
});
