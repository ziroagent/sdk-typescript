import { describe, expect, it } from 'vitest';
import { autoApprove, autoReject, autoSuspend, createAutoApprover } from './presets.js';
import type { ApprovalRequest } from './types.js';

const req = (toolName: string): ApprovalRequest => ({
  toolCallId: 'tc1',
  toolName,
  input: {},
  rawArgs: {},
  context: { step: 1, messages: [] },
});

describe('autoApprove', () => {
  it('returns { decision: "approve" } for any request', async () => {
    expect(await autoApprove(req('anything'))).toEqual({ decision: 'approve' });
    expect(await autoApprove(req('transferFunds'))).toEqual({ decision: 'approve' });
  });
});

describe('autoReject', () => {
  it('uses the default reason when none supplied', async () => {
    const out = await autoReject()(req('whatever'));
    expect(out).toMatchObject({ decision: 'reject' });
    expect((out as { reason: string }).reason).toMatch(/auto-rejected/i);
  });

  it('honours a custom reason', async () => {
    const out = await autoReject('budget freeze')(req('whatever'));
    expect(out).toEqual({ decision: 'reject', reason: 'budget freeze' });
  });
});

describe('autoSuspend', () => {
  it('always suspends', async () => {
    expect(await autoSuspend(req('x'))).toEqual({ decision: 'suspend' });
  });
});

describe('createAutoApprover', () => {
  it('approves names on the allow list', async () => {
    const a = createAutoApprover({ allow: ['searchDocs', 'getWeather'] });
    expect(await a(req('searchDocs'))).toEqual({ decision: 'approve' });
    expect(await a(req('getWeather'))).toEqual({ decision: 'approve' });
  });

  it('rejects names on the deny list with the given reason', async () => {
    const a = createAutoApprover({
      deny: ['transferFunds'],
      denyReason: 'No money movement in test mode.',
    });
    expect(await a(req('transferFunds'))).toEqual({
      decision: 'reject',
      reason: 'No money movement in test mode.',
    });
  });

  it('falls back to suspend by default for unclassified tools (fail-safe)', async () => {
    const a = createAutoApprover({ allow: ['ok'], deny: ['no'] });
    expect(await a(req('mystery'))).toEqual({ decision: 'suspend' });
  });

  it('falls back to approve when default=approve (allowlist + open)', async () => {
    const a = createAutoApprover({ deny: ['transferFunds'], default: 'approve' });
    expect(await a(req('readOnly'))).toEqual({ decision: 'approve' });
    expect(await a(req('transferFunds'))).toMatchObject({ decision: 'reject' });
  });

  it('falls back to reject when default=reject (closed)', async () => {
    const a = createAutoApprover({
      allow: ['searchDocs'],
      default: 'reject',
      denyReason: 'tool not allowed',
    });
    expect(await a(req('searchDocs'))).toEqual({ decision: 'approve' });
    expect(await a(req('anythingElse'))).toEqual({
      decision: 'reject',
      reason: 'tool not allowed',
    });
  });

  it('allow takes precedence over deny when a tool appears in both', async () => {
    const a = createAutoApprover({ allow: ['both'], deny: ['both'] });
    expect(await a(req('both'))).toEqual({ decision: 'approve' });
  });
});
