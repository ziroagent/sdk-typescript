import { type Approver, setApprovalObserver, type ToolCallPart } from '@ziro-agent/core';
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

describe('defineTool({ requiresApproval }) — RFC 0002', () => {
  it('round-trips boolean form', () => {
    const t = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => 'sent',
    });
    expect(t.requiresApproval).toBe(true);
  });

  it('round-trips function form', () => {
    const fn = (input: { amountUsd: number }) => input.amountUsd > 100;
    const t = defineTool({
      name: 'transfer',
      input: z.object({ amountUsd: z.number() }),
      requiresApproval: fn,
      execute: () => 'ok',
    });
    expect(typeof t.requiresApproval).toBe('function');
  });

  it('omits the field when not provided (zero-overhead default)', () => {
    const t = defineTool({
      name: 'noop',
      input: z.object({}),
      execute: () => 'ok',
    });
    expect(t.requiresApproval).toBeUndefined();
  });
});

describe('executeToolCalls — approval gate', () => {
  it('runs immediately when requiresApproval is unset', async () => {
    const t = defineTool({
      name: 'cheap',
      input: z.object({ q: z.string() }),
      execute: (i) => `done:${i.q}`,
    });
    const results = await executeToolCalls({
      tools: { cheap: t },
      toolCalls: [callOf('cheap', { q: 'x' })],
    });
    expect(results[0]?.result).toBe('done:x');
    expect(results[0]?.pendingApproval).toBeUndefined();
  });

  it('short-circuits with pendingApproval when no approver supplied', async () => {
    let executed = false;
    const t = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => {
        executed = true;
        return 'sent';
      },
    });
    const results = await executeToolCalls({
      tools: { send_email: t },
      toolCalls: [callOf('send_email', { to: 'a@b.com' })],
    });
    expect(executed).toBe(false);
    expect(results[0]?.pendingApproval?.toolName).toBe('send_email');
    expect(results[0]?.pendingApproval?.parsedInput).toEqual({ to: 'a@b.com' });
    expect(results[0]?.isError).toBe(false);
    expect(results[0]?.result).toBeNull();
  });

  it('runs the tool when approver returns approve', async () => {
    let received: unknown;
    const t = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: (i) => {
        received = i;
        return 'sent';
      },
    });
    const approver: Approver = async () => ({ decision: 'approve' });
    const results = await executeToolCalls({
      tools: { send_email: t },
      toolCalls: [callOf('send_email', { to: 'a@b.com' })],
      approver,
    });
    expect(received).toEqual({ to: 'a@b.com' });
    expect(results[0]?.result).toBe('sent');
  });

  it('re-validates modifiedInput through the tool schema', async () => {
    let received: unknown;
    const t = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string(), subject: z.string() }),
      requiresApproval: true,
      execute: (i) => {
        received = i;
        return 'sent';
      },
    });
    const approver: Approver = async () => ({
      decision: 'approve',
      modifiedInput: { to: 'corrected@b.com', subject: 'redacted' },
    });
    const results = await executeToolCalls({
      tools: { send_email: t },
      toolCalls: [callOf('send_email', { to: 'a@b.com', subject: 'original' })],
      approver,
    });
    expect(received).toEqual({ to: 'corrected@b.com', subject: 'redacted' });
    expect(results[0]?.result).toBe('sent');
  });

  it('rejects: tool.execute() not called, isError result with reason', async () => {
    let executed = false;
    const t = defineTool({
      name: 'transfer',
      input: z.object({ amountUsd: z.number() }),
      requiresApproval: true,
      execute: () => {
        executed = true;
        return 'transferred';
      },
    });
    const approver: Approver = async () => ({
      decision: 'reject',
      reason: 'Amount exceeds policy limit',
    });
    const results = await executeToolCalls({
      tools: { transfer: t },
      toolCalls: [callOf('transfer', { amountUsd: 500 })],
      approver,
    });
    expect(executed).toBe(false);
    expect(results[0]?.isError).toBe(true);
    expect((results[0]?.result as { name?: string; message?: string })?.message).toContain(
      'Amount exceeds policy limit',
    );
  });

  it('approver-suspend yields pendingApproval (no execute)', async () => {
    let executed = false;
    const t = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => {
        executed = true;
        return 'sent';
      },
    });
    const approver: Approver = async () => ({ decision: 'suspend' });
    const results = await executeToolCalls({
      tools: { send_email: t },
      toolCalls: [callOf('send_email', { to: 'a@b.com' })],
      approver,
    });
    expect(executed).toBe(false);
    expect(results[0]?.pendingApproval?.toolName).toBe('send_email');
  });

  it('function-form gate: approval requested only when predicate returns true', async () => {
    let executed = 0;
    let approvalsRequested = 0;
    const t = defineTool({
      name: 'transfer',
      input: z.object({ amountUsd: z.number() }),
      requiresApproval: (input) => input.amountUsd > 100,
      execute: () => {
        executed++;
        return 'ok';
      },
    });
    const approver: Approver = async () => {
      approvalsRequested++;
      return { decision: 'approve' };
    };
    const results = await executeToolCalls({
      tools: { transfer: t },
      toolCalls: [
        callOf('transfer', { amountUsd: 50 }, 'small'),
        callOf('transfer', { amountUsd: 500 }, 'big'),
      ],
      approver,
    });
    // Both succeed; only the big one consulted the approver.
    expect(results.every((r) => r.result === 'ok')).toBe(true);
    expect(executed).toBe(2);
    expect(approvalsRequested).toBe(1);
  });

  it('approver crash surfaces as a tool error, not a thrown rejection', async () => {
    const t = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => 'sent',
    });
    const approver: Approver = async () => {
      throw new Error('approver crashed');
    };
    // Critically: this must NOT throw — it returns a results array with isError.
    const results = await executeToolCalls({
      tools: { send_email: t },
      toolCalls: [callOf('send_email', { to: 'a@b.com' })],
      approver,
    });
    expect(results[0]?.isError).toBe(true);
    expect((results[0]?.result as { message?: string })?.message).toContain('approver crashed');
  });

  it('fires onRequested + onResolved through the ApprovalObserver hook', async () => {
    const events: string[] = [];
    const previous = setApprovalObserver({
      onRequested: () => events.push('requested'),
      onResolved: (_req, d) => events.push(`resolved:${d.decision}`),
    });
    try {
      const t = defineTool({
        name: 'send_email',
        input: z.object({ to: z.string() }),
        requiresApproval: true,
        execute: () => 'sent',
      });
      const approver: Approver = async () => ({ decision: 'approve' });
      await executeToolCalls({
        tools: { send_email: t },
        toolCalls: [callOf('send_email', { to: 'a@b.com' })],
        approver,
      });
    } finally {
      setApprovalObserver(previous);
    }
    expect(events).toEqual(['requested', 'resolved:approve']);
  });
});
