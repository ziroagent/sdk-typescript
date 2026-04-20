import {
  type ApprovalRequest,
  fireAgentResumed,
  fireAgentSuspended,
  fireApprovalRequested,
  fireApprovalResolved,
} from '@ziro-agent/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ATTR } from './attributes.js';
import { instrumentApproval } from './instrument-approval.js';
import { type SpanLike, setTracer, type ZiroTracer } from './tracer.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  ended: boolean;
}

function recordingTracer(): ZiroTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const make = (name: string, initialAttrs?: Record<string, unknown>): SpanLike => {
    const rec: RecordedSpan = {
      name,
      attributes: { ...(initialAttrs ?? {}) },
      ended: false,
    };
    spans.push(rec);
    return {
      setAttribute(k, v) {
        rec.attributes[k] = v;
      },
      setAttributes(attrs) {
        Object.assign(rec.attributes, attrs);
      },
      setStatus() {},
      recordException() {},
      addEvent() {},
      end() {
        rec.ended = true;
      },
    };
  };
  return {
    spans,
    startSpan(name, options) {
      return make(name, options?.attributes);
    },
    async withSpan(name, fn, options) {
      const span = make(name, options?.attributes);
      try {
        return await fn(span);
      } finally {
        span.end();
      }
    },
  };
}

const sampleRequest: ApprovalRequest = {
  toolCallId: 'call_42',
  toolName: 'transfer',
  input: { amountUsd: 250 },
  rawArgs: { amountUsd: 250 },
  context: { step: 3, messages: [] },
};

let unregister: () => void = () => {};

beforeEach(() => {
  unregister = () => {};
});

afterEach(() => {
  unregister();
});

describe('instrumentApproval — RFC 0002 OTel bridge', () => {
  it('emits ziro.approval.requested with tool name + call id + step', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const reg = instrumentApproval();
    unregister = reg.unregister;

    fireApprovalRequested(sampleRequest);

    const span = tracer.spans.find((s) => s.name === 'ziro.approval.requested');
    expect(span).toBeDefined();
    expect(span?.attributes[ATTR.ApprovalToolName]).toBe('transfer');
    expect(span?.attributes[ATTR.ApprovalToolCallId]).toBe('call_42');
    expect(span?.attributes[ATTR.ApprovalStep]).toBe(3);
    expect(span?.ended).toBe(true);
  });

  it('emits ziro.approval.granted with modified flag', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const reg = instrumentApproval();
    unregister = reg.unregister;

    fireApprovalResolved(sampleRequest, {
      decision: 'approve',
      modifiedInput: { amountUsd: 200 },
    });

    const span = tracer.spans.find((s) => s.name === 'ziro.approval.granted');
    expect(span).toBeDefined();
    expect(span?.attributes[ATTR.ApprovalDecision]).toBe('approve');
    expect(span?.attributes[ATTR.ApprovalModified]).toBe(true);
  });

  it('emits ziro.approval.rejected with reason', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const reg = instrumentApproval();
    unregister = reg.unregister;

    fireApprovalResolved(sampleRequest, {
      decision: 'reject',
      reason: 'over policy',
    });

    const span = tracer.spans.find((s) => s.name === 'ziro.approval.rejected');
    expect(span).toBeDefined();
    expect(span?.attributes[ATTR.ApprovalReason]).toBe('over policy');
  });

  it('emits ziro.approval.suspended on suspend decision', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const reg = instrumentApproval();
    unregister = reg.unregister;

    fireApprovalResolved(sampleRequest, { decision: 'suspend' });

    const span = tracer.spans.find((s) => s.name === 'ziro.approval.suspended');
    expect(span).toBeDefined();
  });

  it('emits ziro.agent.suspended span with pendingCount', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const reg = instrumentApproval();
    unregister = reg.unregister;

    fireAgentSuspended({ agentId: 'agent-1', step: 5, pendingCount: 2 });

    const span = tracer.spans.find((s) => s.name === 'ziro.agent.suspended');
    expect(span).toBeDefined();
    expect(span?.attributes[ATTR.AgentSuspendedStep]).toBe(5);
    expect(span?.attributes[ATTR.AgentSuspendedPendingCount]).toBe(2);
    expect(span?.attributes[ATTR.AgentSuspendedAgentId]).toBe('agent-1');
  });

  it('emits ziro.agent.resumed span with decision counts', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const reg = instrumentApproval();
    unregister = reg.unregister;

    fireAgentResumed({
      agentId: 'agent-1',
      step: 5,
      decisionCounts: { approve: 1, reject: 1, suspend: 0 },
    });

    const span = tracer.spans.find((s) => s.name === 'ziro.agent.resumed');
    expect(span).toBeDefined();
    expect(span?.attributes[ATTR.AgentResumedDecisionApprove]).toBe(1);
    expect(span?.attributes[ATTR.AgentResumedDecisionReject]).toBe(1);
    expect(span?.attributes[ATTR.AgentResumedDecisionSuspend]).toBe(0);
  });

  it('unregister() restores the previous observer', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const reg = instrumentApproval();
    reg.unregister();

    fireApprovalRequested(sampleRequest);
    // After unregister, no spans should be recorded.
    expect(tracer.spans).toHaveLength(0);
  });
});
