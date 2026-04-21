import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';
import { executeToolCalls } from './execute.js';

describe('executeToolCalls repairToolCall', () => {
  const tool = defineTool({
    name: 'echo',
    input: z.object({ n: z.literal(2) }),
    execute: ({ n }) => n + 10,
  });

  it('retries once when repair returns fixed args', async () => {
    const results = await executeToolCalls({
      tools: { echo: tool },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'echo',
          args: { n: 3 },
        },
      ],
      repairToolCall: (call) =>
        (call.args as { n?: number })?.n === 3 ? { ...call, args: { n: 2 } } : null,
      step: 1,
    });
    expect(results[0]?.isError).toBe(false);
    expect(results[0]?.result).toBe(12);
  });

  it('surfaces error when repair returns null', async () => {
    const results = await executeToolCalls({
      tools: { echo: tool },
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'echo',
          args: { n: 'bad' },
        },
      ],
      repairToolCall: () => null,
    });
    expect(results[0]?.isError).toBe(true);
  });
});
