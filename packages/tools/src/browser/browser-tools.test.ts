import { autoApprove, createStubBrowserAdapter } from '@ziro-agent/core';
import { describe, expect, it } from 'vitest';
import { executeToolCalls } from '../execute.js';
import { createBrowserGotoTool, createBrowserScreenshotTool } from './browser-tools.js';

describe('createBrowserGotoTool', () => {
  it('invokes BrowserAdapter.goto', async () => {
    const { adapter, getVisited } = createStubBrowserAdapter();
    const tool = createBrowserGotoTool({ browser: adapter });
    await executeToolCalls({
      tools: { [tool.name]: tool },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 'b1',
          toolName: tool.name,
          args: { url: 'https://example.com/path' },
        },
      ],
      approver: autoApprove,
    });
    expect(getVisited()).toEqual(['https://example.com/path']);
  });
});

describe('createBrowserScreenshotTool', () => {
  it('returns a PNG-shaped payload when screenshot exists', async () => {
    const { adapter } = createStubBrowserAdapter();
    const tool = createBrowserScreenshotTool({ browser: adapter });
    const res = await executeToolCalls({
      tools: { [tool.name]: tool },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 's1',
          toolName: tool.name,
          args: {},
        },
      ],
      approver: autoApprove,
    });
    const out = res[0]?.result as { base64?: string; mimeType?: string };
    expect(out?.mimeType).toBe('image/png');
    expect(out?.base64?.length).toBeGreaterThan(4);
  });

  it('throws when screenshot is missing', async () => {
    const bare: import('@ziro-agent/core').BrowserAdapter = {
      kind: 'bare',
      async goto() {},
    };
    const tool = createBrowserScreenshotTool({ browser: bare });
    const res = await executeToolCalls({
      tools: { [tool.name]: tool },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 's2',
          toolName: tool.name,
          args: {},
        },
      ],
      approver: autoApprove,
    });
    expect(res[0]?.isError).toBe(true);
  });
});
