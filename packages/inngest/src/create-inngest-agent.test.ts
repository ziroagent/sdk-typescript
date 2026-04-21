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
import { describe, expect, it, vi } from 'vitest';
import { createInngestAgent, type InngestClientLike } from './create-inngest-agent.js';
import type { InngestStepLike } from './inngest-step.js';

function noopCheckpointer(): Checkpointer {
  return {
    async put(_t: string, _s: AgentSnapshot): Promise<CheckpointId> {
      return 'cp-x';
    },
    async get(): Promise<AgentSnapshot | null> {
      return null;
    },
    async list(): Promise<CheckpointMeta[]> {
      return [];
    },
    async delete(): Promise<void> {},
  };
}

function fakeAgent(opts: { withCheckpointer?: boolean } = {}): Agent {
  const result: AgentRunResult = {
    text: 'done',
    steps: [],
    totalUsage: {},
    finishReason: 'stop',
    messages: [],
  };
  return {
    name: 'support',
    tools: {},
    checkpointer: opts.withCheckpointer ? noopCheckpointer() : undefined,
    async run(_o: AgentRunOptions) {
      return result;
    },
    async resume(_s: AgentSnapshot, _o: AgentResumeOptions) {
      return result;
    },
    async resumeFromCheckpoint() {
      return result;
    },
  };
}

interface RegisteredFn {
  config: { id: string };
  trigger: { event: string };
  handler: (ctx: {
    event: { name: string; data: Record<string, unknown> };
    step: InngestStepLike;
  }) => Promise<unknown>;
}

function fakeInngest(): InngestClientLike & { registered: RegisteredFn[] } {
  const registered: RegisteredFn[] = [];
  return {
    registered,
    createFunction(config, trigger, handler) {
      const fn: RegisteredFn = {
        config: { id: config.id },
        trigger: trigger as { event: string },
        handler: handler as RegisteredFn['handler'],
      };
      registered.push(fn);
      return fn;
    },
  };
}

const memoStep = (): InngestStepLike => {
  const memo = new Map<string, unknown>();
  return {
    async run<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
      if (memo.has(id)) return memo.get(id) as T;
      const out = await fn();
      memo.set(id, out);
      return out;
    },
  };
};

describe('createInngestAgent', () => {
  it('registers a :run function listening on the default event', () => {
    const agent = fakeAgent({ withCheckpointer: true });
    const inngest = fakeInngest();
    createInngestAgent({ inngest, agent });
    const runFn = inngest.registered.find((f) => f.config.id.endsWith(':run'));
    expect(runFn).toBeDefined();
    expect(runFn?.trigger.event).toBe('ziro/agent.run.requested');
    expect(runFn?.config.id).toBe('support:run');
  });

  it('registers a :resume function when checkpointer + enableResume', () => {
    const agent = fakeAgent({ withCheckpointer: true });
    const inngest = fakeInngest();
    const { resumeFn } = createInngestAgent({ inngest, agent });
    expect(resumeFn).toBeDefined();
    const fn = inngest.registered.find((f) => f.config.id.endsWith(':resume'));
    expect(fn?.trigger.event).toBe('ziro/agent.resume.requested');
  });

  it('throws when enableResume but agent has no checkpointer', () => {
    const agent = fakeAgent({ withCheckpointer: false });
    const inngest = fakeInngest();
    expect(() => createInngestAgent({ inngest, agent })).toThrow(/requires the Agent to have/);
  });

  it('skips resume function registration when enableResume=false', () => {
    const agent = fakeAgent({ withCheckpointer: false });
    const inngest = fakeInngest();
    const { resumeFn } = createInngestAgent({ inngest, agent, enableResume: false });
    expect(resumeFn).toBeNull();
    expect(inngest.registered).toHaveLength(1);
  });

  it('honours custom event names + functionId', () => {
    const agent = fakeAgent({ withCheckpointer: true });
    const inngest = fakeInngest();
    createInngestAgent({
      inngest,
      agent,
      functionId: 'billing-bot',
      runEvent: 'app/billing.run',
      resumeEvent: 'app/billing.resume',
    });
    const ids = inngest.registered.map((f) => f.config.id);
    const events = inngest.registered.map((f) => f.trigger.event);
    expect(ids).toEqual(['billing-bot:run', 'billing-bot:resume']);
    expect(events).toEqual(['app/billing.run', 'app/billing.resume']);
  });

  it('forwards event payload (prompt + threadId + metadata) into agent.run', async () => {
    const agent = fakeAgent({ withCheckpointer: true });
    const runSpy = vi.spyOn(agent, 'run');
    const inngest = fakeInngest();
    createInngestAgent({ inngest, agent });

    const runFn = inngest.registered.find((f) => f.config.id === 'support:run');
    expect(runFn).toBeDefined();
    if (!runFn) return;

    await runFn.handler({
      event: {
        name: 'ziro/agent.run.requested',
        data: {
          prompt: 'hi',
          threadId: 't1',
          metadata: { user: 'u1' },
          budget: { maxUsdPerRun: 0.5 },
          toolBudget: { maxUsdPerRun: 0.1 },
        },
      },
      step: memoStep(),
    });

    expect(runSpy).toHaveBeenCalledWith({
      prompt: 'hi',
      threadId: 't1',
      metadata: { user: 'u1' },
      budget: { maxUsdPerRun: 0.5 },
      toolBudget: { maxUsdPerRun: 0.1 },
    });
  });

  it('resume handler forwards decisions + checkpointId to agent.resumeFromCheckpoint', async () => {
    const agent = fakeAgent({ withCheckpointer: true });
    const spy = vi.spyOn(agent, 'resumeFromCheckpoint');
    const inngest = fakeInngest();
    createInngestAgent({ inngest, agent });

    const resumeFn = inngest.registered.find((f) => f.config.id === 'support:resume');
    expect(resumeFn).toBeDefined();
    if (!resumeFn) return;

    await resumeFn.handler({
      event: {
        name: 'ziro/agent.resume.requested',
        data: {
          threadId: 't1',
          decisions: { tc1: { decision: 'approve' } },
          checkpointId: 'cp-7',
          budget: { maxUsdPerRun: 1 },
          toolBudget: { maxUsdPerRun: 0.2 },
        },
      },
      step: memoStep(),
    });
    expect(spy).toHaveBeenCalledWith('t1', {
      decisions: { tc1: { decision: 'approve' } },
      checkpointId: 'cp-7',
      budget: { maxUsdPerRun: 1 },
      toolBudget: { maxUsdPerRun: 0.2 },
    });
  });
});
