import { describe, expect, it } from 'vitest';
import {
  type ApprovalDecision,
  type ApprovalObserver,
  type ApprovalRequest,
  fireAgentResumed,
  fireAgentSuspended,
  fireApprovalRequested,
  fireApprovalResolved,
  setApprovalObserver,
} from './index.js';

const sampleRequest: ApprovalRequest = {
  toolCallId: 'call_1',
  toolName: 'send_email',
  toolDescription: 'Send an email.',
  input: { to: 'a@b.com', subject: 'hi' },
  rawArgs: { to: 'a@b.com', subject: 'hi' },
  context: { step: 1, messages: [] },
};

describe('ApprovalObserver — RFC 0002', () => {
  it('forwards onRequested / onResolved through the registered observer', () => {
    const requested: ApprovalRequest[] = [];
    const resolved: Array<{ req: ApprovalRequest; decision: ApprovalDecision }> = [];
    const observer: ApprovalObserver = {
      onRequested: (r) => requested.push(r),
      onResolved: (r, d) => resolved.push({ req: r, decision: d }),
    };
    const previous = setApprovalObserver(observer);
    try {
      fireApprovalRequested(sampleRequest);
      fireApprovalResolved(sampleRequest, { decision: 'approve' });
      fireApprovalResolved(sampleRequest, { decision: 'reject', reason: 'no' });
    } finally {
      setApprovalObserver(previous);
    }
    expect(requested).toHaveLength(1);
    expect(requested[0]?.toolCallId).toBe('call_1');
    expect(resolved.map((r) => r.decision.decision)).toEqual(['approve', 'reject']);
  });

  it('forwards onAgentSuspended / onAgentResumed', () => {
    const suspended: Array<unknown> = [];
    const resumed: Array<unknown> = [];
    const observer: ApprovalObserver = {
      onAgentSuspended: (a) => suspended.push(a),
      onAgentResumed: (a) => resumed.push(a),
    };
    const previous = setApprovalObserver(observer);
    try {
      fireAgentSuspended({ agentId: 'agent-1', step: 3, pendingCount: 2 });
      fireAgentResumed({
        agentId: 'agent-1',
        step: 3,
        decisionCounts: { approve: 1, reject: 1, suspend: 0 },
      });
    } finally {
      setApprovalObserver(previous);
    }
    expect(suspended).toHaveLength(1);
    expect(resumed).toHaveLength(1);
  });

  it('swallows observer exceptions — instrumentation bugs do not break user code', () => {
    const observer: ApprovalObserver = {
      onRequested: () => {
        throw new Error('boom');
      },
      onResolved: () => {
        throw new Error('boom');
      },
    };
    const previous = setApprovalObserver(observer);
    try {
      expect(() => fireApprovalRequested(sampleRequest)).not.toThrow();
      expect(() => fireApprovalResolved(sampleRequest, { decision: 'suspend' })).not.toThrow();
    } finally {
      setApprovalObserver(previous);
    }
  });

  it('returns previous observer from setApprovalObserver for restore patterns', () => {
    setApprovalObserver(null);
    const first: ApprovalObserver = { onRequested: () => undefined };
    const prev1 = setApprovalObserver(first);
    expect(prev1).toBeNull();
    const second: ApprovalObserver = { onRequested: () => undefined };
    const prev2 = setApprovalObserver(second);
    expect(prev2).toBe(first);
    setApprovalObserver(null);
  });

  it('no-ops cleanly when no observer is installed', () => {
    setApprovalObserver(null);
    expect(() => fireApprovalRequested(sampleRequest)).not.toThrow();
    expect(() => fireAgentSuspended({ step: 1, pendingCount: 1 })).not.toThrow();
  });
});
