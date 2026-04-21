/**
 * Stub sandbox + stub browser wired to `createCodeInterpreterTool` /
 * `createBrowserGotoTool`, executed via `executeToolCalls` with an auto-approver
 * (tools use `mutates: true` per RFC 0013).
 *
 * Production: swap stubs for `createE2bSandboxAdapter({ sandbox })` from
 * `@ziro-agent/sandbox-e2b` and `createPlaywrightBrowserAdapter(page)` from
 * `@ziro-agent/browser-playwright`.
 */
import { createStubBrowserAdapter, createStubSandboxAdapter } from '@ziro-agent/core';
import {
  createBrowserGotoTool,
  createCodeInterpreterTool,
  executeToolCalls,
} from '@ziro-agent/tools';

const sandboxAdapter = createStubSandboxAdapter({ prefix: '[demo-stub] ' });
const codeInterpreter = createCodeInterpreterTool({ sandbox: sandboxAdapter });

const { adapter: browserAdapter } = createStubBrowserAdapter();
const browserGoto = createBrowserGotoTool({ browser: browserAdapter });

const tools = {
  code_interpreter: codeInterpreter,
  browser_goto: browserGoto,
};

const results = await executeToolCalls({
  tools,
  approver: async () => ({ decision: 'approve' }),
  toolCalls: [
    {
      type: 'tool-call',
      toolCallId: 'call_ci_1',
      toolName: 'code_interpreter',
      args: { code: 'print("hello")', language: 'python' },
    },
    {
      type: 'tool-call',
      toolCallId: 'call_bg_1',
      toolName: 'browser_goto',
      args: { url: 'https://example.com' },
    },
  ],
});

for (const r of results) {
  console.log(`--- ${r.toolName} (${r.toolCallId}) ---`);
  if (r.pendingApproval) console.log('pendingApproval:', r.pendingApproval);
  else if (r.isError) console.error('error:', r.result);
  else console.log('result:', r.result);
}
