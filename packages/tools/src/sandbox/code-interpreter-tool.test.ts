import { autoApprove, createStubSandboxAdapter } from '@ziro-agent/core';
import { describe, expect, it } from 'vitest';
import { executeToolCalls } from '../execute.js';
import { createCodeInterpreterTool } from './code-interpreter-tool.js';

describe('createCodeInterpreterTool', () => {
  it('runs code through the sandbox adapter', async () => {
    const sandbox = createStubSandboxAdapter({ prefix: '[test] ' });
    const tool = createCodeInterpreterTool({ sandbox });
    const res = await executeToolCalls({
      tools: { [tool.name]: tool },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: 'c1',
          toolName: tool.name,
          args: { code: 'print(1)', language: 'python' },
        },
      ],
      approver: autoApprove,
    });
    expect(res[0]?.pendingApproval).toBeUndefined();
    expect(res[0]?.result).toMatchObject({
      exitCode: 0,
      stdout: expect.stringContaining('[test]'),
    });
  });
});
