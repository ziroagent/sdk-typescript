import type { ToolCallPart } from '@ziro-agent/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';
import { executeToolCalls } from './execute.js';

const callOf = (toolName: string, args: unknown, id = 'call_1'): ToolCallPart => ({
  type: 'tool-call',
  toolCallId: id,
  toolName,
  args,
});

describe('defineTool({ mutates }) — v0.5 C1 default-deny', () => {
  it('sets requiresApproval to true when mutates is true and requiresApproval is omitted', () => {
    const t = defineTool({
      name: 'delete_row',
      input: z.object({ id: z.string() }),
      mutates: true,
      execute: () => 'ok',
    });
    expect(t.mutates).toBe(true);
    expect(t.requiresApproval).toBe(true);
  });

  it('allows explicit requiresApproval: false to opt out while keeping mutates', () => {
    const t = defineTool({
      name: 'internal_log',
      input: z.object({ msg: z.string() }),
      mutates: true,
      requiresApproval: false,
      execute: () => undefined,
    });
    expect(t.mutates).toBe(true);
    expect(t.requiresApproval).toBe(false);
  });

  it('does not override an explicit requiresApproval function', () => {
    const gate = (input: { amount: number }) => input.amount > 10;
    const t = defineTool({
      name: 'pay',
      input: z.object({ amount: z.number() }),
      mutates: true,
      requiresApproval: gate,
      execute: () => 'paid',
    });
    expect(t.mutates).toBe(true);
    expect(t.requiresApproval).toBe(gate);
  });

  it('omits mutates from the tool object when unset', () => {
    const t = defineTool({
      name: 'read_only',
      input: z.object({ q: z.string() }),
      execute: () => [],
    });
    expect(t.mutates).toBeUndefined();
    expect(t.requiresApproval).toBeUndefined();
  });

  it('short-circuits with pendingApproval when mutates-only and no approver', async () => {
    const t = defineTool({
      name: 'wipe',
      input: z.object({}),
      mutates: true,
      execute: () => 'wiped',
    });
    const results = await executeToolCalls({
      tools: { wipe: t },
      toolCalls: [callOf('wipe', {})],
    });
    expect(results[0]?.pendingApproval).toBeDefined();
    expect(results[0]?.pendingApproval?.toolName).toBe('wipe');
  });
});
