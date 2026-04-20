import type {
  Agent,
  AgentResumeOptions,
  AgentRunOptions,
  AgentRunResult,
  AgentSnapshot,
  Checkpointer,
  CheckpointId,
  CheckpointMeta,
} from '@ziro-agent/agent';
import { AgentSuspendedError, isAgentSuspendedError } from '@ziro-agent/agent';
import { describe, expect, it, vi } from 'vitest';
import {
  InngestAgentSuspendedError,
  type InngestStepLike,
  resumeAsStep,
  runAsStep,
} from './inngest-step.js';

/**
 * In-memory `step.run` mock that tracks invocations + memoizes results
 * per stepId. Behaves like Inngest's real `step.run` for the purposes
 * of testing memoization assertions:
 *  - Each `id` may be invoked at most once per step instance (re-using
 *    the cached value).
 *  - Errors propagate.
 */
function memoizingStep(): InngestStepLike & { calls: string[]; memo: Map<string, unknown> } {
  const memo = new Map<string, unknown>();
  const calls: string[] = [];
  return {
    calls,
    memo,
    async run<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
      calls.push(id);
      if (memo.has(id)) return memo.get(id) as T;
      const out = await fn();
      memo.set(id, out);
      return out;
    },
  };
}

const baseSnapshot = (overrides: Partial<AgentSnapshot> = {}): AgentSnapshot => ({
  version: 2,
  agentId: 'a',
  threadId: 't',
  step: 0,
  messages: [],
  pendingApprovals: [{ toolCallId: 'tc1', toolName: 'wire', args: { amount: 100 } }],
  metadata: {},
  budget: undefined,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

interface FakeAgentArgs {
  result?: AgentRunResult;
  suspendOnce?: boolean;
  checkpointer?: Checkpointer;
}

function fakeAgent(args: FakeAgentArgs = {}): Agent {
  let suspendUsed = false;
  const okResult: AgentRunResult = args.result ?? {
    text: 'done',
    steps: [],
    totalUsage: {},
    finishReason: 'stop',
    messages: [],
  };

  const agent: Agent = {
    name: 'fake',
    tools: {},
    checkpointer: args.checkpointer,
    async run(_options: AgentRunOptions): Promise<AgentRunResult> {
      if (args.suspendOnce && !suspendUsed) {
        suspendUsed = true;
        throw new AgentSuspendedError({ snapshot: baseSnapshot() });
      }
      return okResult;
    },
    async resume(_snapshot: AgentSnapshot, _options: AgentResumeOptions): Promise<AgentRunResult> {
      return okResult;
    },
    async resumeFromCheckpoint(): Promise<AgentRunResult> {
      return okResult;
    },
  };
  return agent;
}

function fakeCheckpointer(): Checkpointer & { puts: AgentSnapshot[] } {
  const puts: AgentSnapshot[] = [];
  let counter = 0;
  return {
    puts,
    async put(_threadId: string, snapshot: AgentSnapshot): Promise<CheckpointId> {
      puts.push(snapshot);
      return `cp-${++counter}`;
    },
    async get(): Promise<AgentSnapshot | null> {
      return puts[puts.length - 1] ?? null;
    },
    async list(): Promise<CheckpointMeta[]> {
      return puts.map((s, i) => ({
        id: `cp-${i + 1}`,
        threadId: 't',
        createdAt: new Date(0),
        agentSnapshotVersion: s.version,
        sizeBytes: 0,
      }));
    },
    async delete(): Promise<void> {
      puts.length = 0;
    },
  };
}

describe('runAsStep', () => {
  it('invokes the agent inside step.run with the default stepId', async () => {
    const agent = fakeAgent();
    const step = memoizingStep();
    const runSpy = vi.spyOn(agent, 'run');

    const out = await runAsStep(step, agent, { prompt: 'hi' });

    expect(out.result?.text).toBe('done');
    expect(out.suspended).toBeUndefined();
    expect(step.calls).toEqual(['ziro:agent:run']);
    expect(runSpy).toHaveBeenCalledWith({ prompt: 'hi' });
  });

  it('memoizes the agent run across function retries (Inngest contract)', async () => {
    const agent = fakeAgent();
    const step = memoizingStep();
    const runSpy = vi.spyOn(agent, 'run');

    await runAsStep(step, agent, { prompt: 'hi' });
    // Simulate Inngest re-invoking the function: same step instance
    // (memoized) should NOT call the agent again.
    await runAsStep(step, agent, { prompt: 'hi' });

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(step.calls).toEqual(['ziro:agent:run', 'ziro:agent:run']);
  });

  it('persists the snapshot via checkpointer when agent suspends', async () => {
    const cp = fakeCheckpointer();
    const agent = fakeAgent({ suspendOnce: true, checkpointer: cp });
    const step = memoizingStep();

    await expect(runAsStep(step, agent, { prompt: 'wire 100', threadId: 't' })).rejects.toThrow(
      InngestAgentSuspendedError,
    );

    expect(cp.puts).toHaveLength(1);
    expect(cp.puts[0]?.pendingApprovals[0]?.toolName).toBe('wire');
    // Persistence happens inside its OWN step.run boundary so it is
    // also memoized across retries.
    expect(step.calls).toContain('ziro:agent:run:persist-suspended');
  });

  it('rethrown InngestAgentSuspendedError is recognised by isAgentSuspendedError', async () => {
    const cp = fakeCheckpointer();
    const agent = fakeAgent({ suspendOnce: true, checkpointer: cp });
    const step = memoizingStep();

    try {
      await runAsStep(step, agent, { prompt: 'x', threadId: 't' });
      throw new Error('expected throw');
    } catch (err) {
      expect(isAgentSuspendedError(err)).toBe(true);
      const wrapped = err as InngestAgentSuspendedError;
      expect(wrapped.checkpointId).toBe('cp-1');
      expect(wrapped.snapshot.pendingApprovals).toHaveLength(1);
    }
  });

  it('does not persist when the agent has no checkpointer', async () => {
    const agent = fakeAgent({ suspendOnce: true });
    const step = memoizingStep();

    await expect(runAsStep(step, agent, { prompt: 'x', threadId: 't' })).rejects.toThrow(
      InngestAgentSuspendedError,
    );
    // No checkpointer → no persist step.
    expect(step.calls.some((c) => c.endsWith(':persist-suspended'))).toBe(false);
  });

  it('does not persist when persistSuspended is false', async () => {
    const cp = fakeCheckpointer();
    const agent = fakeAgent({ suspendOnce: true, checkpointer: cp });
    const step = memoizingStep();

    await expect(
      runAsStep(step, agent, { prompt: 'x', threadId: 't', persistSuspended: false }),
    ).rejects.toThrow(InngestAgentSuspendedError);
    expect(cp.puts).toHaveLength(0);
  });

  it('honours custom stepId', async () => {
    const agent = fakeAgent();
    const step = memoizingStep();
    await runAsStep(step, agent, { prompt: 'x', stepId: 'custom-id' });
    expect(step.calls).toEqual(['custom-id']);
  });
});

describe('resumeAsStep', () => {
  it('calls agent.resumeFromCheckpoint inside step.run', async () => {
    const cp = fakeCheckpointer();
    const agent = fakeAgent({ checkpointer: cp });
    const step = memoizingStep();
    const spy = vi.spyOn(agent, 'resumeFromCheckpoint');

    const out = await resumeAsStep(step, agent, 't', {
      decisions: { tc1: { decision: 'approve' } },
    });

    expect(out.result?.text).toBe('done');
    expect(step.calls).toEqual(['ziro:agent:resume']);
    expect(spy).toHaveBeenCalledWith('t', { decisions: { tc1: { decision: 'approve' } } });
  });

  it('throws if the agent has no checkpointer', async () => {
    const agent = fakeAgent();
    const step = memoizingStep();
    await expect(resumeAsStep(step, agent, 't', { decisions: {} })).rejects.toThrow(
      /requires the Agent to be created with a `checkpointer`/,
    );
  });
});
