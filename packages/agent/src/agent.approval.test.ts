import type { Approver, LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import { defineTool } from '@ziro-agent/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';
import type { Checkpointer, CheckpointId, CheckpointMeta } from './checkpointer.js';
import {
  type AgentSnapshot,
  AgentSuspendedError,
  CURRENT_SNAPSHOT_VERSION,
  isAgentSuspendedError,
  migrateSnapshot,
} from './snapshot.js';

/**
 * Scripted model: returns the next response on each `.generate()`. Tool
 * calls in the response carry the `toolCallId` that the test expects to
 * see, so suspension semantics are deterministic.
 */
function scriptedModel(responses: ModelGenerateResult[]): LanguageModel {
  let i = 0;
  return {
    modelId: 'mock',
    provider: 'mock',
    async generate(): Promise<ModelGenerateResult> {
      const r = responses[i++];
      if (!r) throw new Error(`Mock model exhausted (called ${i} times)`);
      return r;
    },
    async stream() {
      throw new Error('not implemented');
    },
  };
}

const finalText = (s: string): ModelGenerateResult => ({
  text: s,
  content: [{ type: 'text', text: s }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

const toolCallStep = (
  calls: Array<{ id: string; name: string; args: unknown }>,
): ModelGenerateResult => ({
  text: '',
  content: calls.map((c) => ({
    type: 'tool-call',
    toolCallId: c.id,
    toolName: c.name,
    args: c.args,
  })),
  toolCalls: calls.map((c) => ({
    type: 'tool-call' as const,
    toolCallId: c.id,
    toolName: c.name,
    args: c.args,
  })),
  finishReason: 'tool-calls',
  usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
});

describe('createAgent — HITL suspend/resume (RFC 0002)', () => {
  it('suspends with AgentSuspendedError when no approver is supplied', async () => {
    const sendEmail = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => 'sent',
    });
    const agent = createAgent({
      tools: { send_email: sendEmail },
      model: scriptedModel([
        toolCallStep([{ id: 'c1', name: 'send_email', args: { to: 'a@b.com' } }]),
      ]),
    });

    let captured: AgentSuspendedError | undefined;
    try {
      await agent.run({ prompt: 'send the email', agentId: 'agent-1' });
    } catch (err) {
      if (err instanceof AgentSuspendedError) captured = err;
    }
    expect(captured).toBeDefined();
    expect(captured?.snapshot.pendingApprovals).toHaveLength(1);
    expect(captured?.snapshot.pendingApprovals[0]?.toolName).toBe('send_email');
    expect(captured?.snapshot.agentId).toBe('agent-1');
    expect(captured?.snapshot.step).toBe(1);
    // Must be JSON-serializable.
    const round = JSON.parse(JSON.stringify(captured?.snapshot));
    expect(round.pendingApprovals[0].toolName).toBe('send_email');
  });

  it('isAgentSuspendedError works cross-realm via brand', async () => {
    const t = defineTool({
      name: 't',
      input: z.object({}),
      requiresApproval: true,
      execute: () => 'ok',
    });
    const agent = createAgent({
      tools: { t },
      model: scriptedModel([toolCallStep([{ id: 'c1', name: 't', args: {} }])]),
    });
    try {
      await agent.run({ prompt: 'go' });
      expect.fail('should have suspended');
    } catch (err) {
      expect(isAgentSuspendedError(err)).toBe(true);
    }
  });

  it('approve inline (run-time approver) — tool runs without suspension', async () => {
    let executed = false;
    const sendEmail = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => {
        executed = true;
        return 'sent';
      },
    });
    const approver: Approver = async () => ({ decision: 'approve' });
    const agent = createAgent({
      tools: { send_email: sendEmail },
      model: scriptedModel([
        toolCallStep([{ id: 'c1', name: 'send_email', args: { to: 'a@b.com' } }]),
        finalText('done'),
      ]),
    });
    const result = await agent.run({ prompt: 'send', approver });
    expect(executed).toBe(true);
    expect(result.text).toBe('done');
    expect(result.finishReason).toBe('completed');
  });

  it('resume({approve}) executes the tool and continues to completion', async () => {
    let executed = false;
    const sendEmail = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => {
        executed = true;
        return 'sent';
      },
    });
    const agent = createAgent({
      tools: { send_email: sendEmail },
      model: scriptedModel([
        toolCallStep([{ id: 'c1', name: 'send_email', args: { to: 'a@b.com' } }]),
        finalText('all done'),
      ]),
    });

    let snapshot: AgentSuspendedError['snapshot'] | undefined;
    try {
      await agent.run({ prompt: 'send' });
    } catch (err) {
      if (err instanceof AgentSuspendedError) snapshot = err.snapshot;
    }
    if (!snapshot) throw new Error('expected suspension');

    expect(executed).toBe(false);

    const result = await agent.resume(snapshot, {
      decisions: { c1: { decision: 'approve' } },
    });

    expect(executed).toBe(true);
    expect(result.text).toBe('all done');
    expect(result.finishReason).toBe('completed');
  });

  it('resume({reject}) feeds an error tool message back to the model', async () => {
    let executed = false;
    const sendEmail = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => {
        executed = true;
        return 'sent';
      },
    });
    const agent = createAgent({
      tools: { send_email: sendEmail },
      model: scriptedModel([
        toolCallStep([{ id: 'c1', name: 'send_email', args: { to: 'a@b.com' } }]),
        finalText('I tried but it was rejected.'),
      ]),
    });

    let snapshot: AgentSuspendedError['snapshot'] | undefined;
    try {
      await agent.run({ prompt: 'send' });
    } catch (err) {
      if (err instanceof AgentSuspendedError) snapshot = err.snapshot;
    }
    if (!snapshot) throw new Error('expected suspension');

    const result = await agent.resume(snapshot, {
      decisions: {
        c1: { decision: 'reject', reason: 'too risky' },
      },
    });
    expect(executed).toBe(false);
    expect(result.finishReason).toBe('completed');
    expect(result.text).toBe('I tried but it was rejected.');
    // The synthesized step in resume carries an error tool result.
    const synth = result.steps[0];
    expect(synth?.toolResults[0]?.isError).toBe(true);
  });

  it('resume({suspend}) re-throws AgentSuspendedError with refreshed snapshot', async () => {
    const sendEmail = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => 'sent',
    });
    const agent = createAgent({
      tools: { send_email: sendEmail },
      model: scriptedModel([
        toolCallStep([{ id: 'c1', name: 'send_email', args: { to: 'a@b.com' } }]),
      ]),
    });

    let snap1: AgentSuspendedError['snapshot'] | undefined;
    try {
      await agent.run({ prompt: 'send' });
    } catch (err) {
      if (err instanceof AgentSuspendedError) snap1 = err.snapshot;
    }
    if (!snap1) throw new Error('expected first suspension');

    let snap2: AgentSuspendedError['snapshot'] | undefined;
    try {
      await agent.resume(snap1, {
        decisions: { c1: { decision: 'suspend' } },
      });
    } catch (err) {
      if (err instanceof AgentSuspendedError) snap2 = err.snapshot;
    }
    expect(snap2).toBeDefined();
    expect(snap2?.pendingApprovals).toHaveLength(1);
    // Second suspension carries forward and is timestamped fresh.
    expect(new Date(snap2?.createdAt ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(snap1.createdAt).getTime(),
    );
  });

  it('resume carries budget usage forward (preset) so cap is not bypassed', async () => {
    const sendEmail = defineTool({
      name: 'send_email',
      input: z.object({ to: z.string() }),
      requiresApproval: true,
      execute: () => 'sent',
    });
    const agent = createAgent({
      tools: { send_email: sendEmail },
      model: scriptedModel([
        toolCallStep([{ id: 'c1', name: 'send_email', args: { to: 'a@b.com' } }]),
        // After resume, the next LLM call will push llmCalls beyond the cap.
        finalText('done'),
      ]),
    });

    let snapshot: AgentSuspendedError['snapshot'] | undefined;
    try {
      await agent.run({
        prompt: 'send',
        // maxLlmCalls=1 means: pre-flight check passes for call #1, the
        // suspension happens AFTER that LLM call. On resume, the model is
        // asked to make a second LLM call which should now overrun.
        budget: { maxLlmCalls: 1 },
      });
    } catch (err) {
      if (err instanceof AgentSuspendedError) snapshot = err.snapshot;
    }
    if (!snapshot) throw new Error('expected suspension');
    expect(snapshot.budgetUsage?.llmCalls).toBe(1);

    let resumeErr: unknown;
    try {
      await agent.resume(snapshot, {
        decisions: { c1: { decision: 'approve' } },
        budget: { maxLlmCalls: 1 },
      });
    } catch (err) {
      resumeErr = err;
    }
    // The second LLM call inside resume should overrun because the
    // preset usage already counted the first call.
    expect(resumeErr).toBeDefined();
    expect((resumeErr as Error).name).toBe('BudgetExceededError');
  });

  it('snapshot preserves resolved siblings when only some calls in a batch need approval', async () => {
    let cheapRan = false;
    const cheap = defineTool({
      name: 'cheap',
      input: z.object({}),
      execute: () => {
        cheapRan = true;
        return 'cheap_done';
      },
    });
    const dangerous = defineTool({
      name: 'dangerous',
      input: z.object({}),
      requiresApproval: true,
      execute: () => 'dangerous_done',
    });
    const agent = createAgent({
      tools: { cheap, dangerous },
      model: scriptedModel([
        toolCallStep([
          { id: 'c1', name: 'cheap', args: {} },
          { id: 'c2', name: 'dangerous', args: {} },
        ]),
        finalText('all done'),
      ]),
    });

    let snapshot: AgentSuspendedError['snapshot'] | undefined;
    try {
      await agent.run({ prompt: 'go' });
    } catch (err) {
      if (err instanceof AgentSuspendedError) snapshot = err.snapshot;
    }
    if (!snapshot) throw new Error('expected suspension');

    // Cheap already ran; dangerous is pending.
    expect(cheapRan).toBe(true);
    expect(snapshot.resolvedSiblings).toHaveLength(1);
    expect(snapshot.resolvedSiblings[0]?.toolName).toBe('cheap');
    expect(snapshot.pendingApprovals).toHaveLength(1);
    expect(snapshot.pendingApprovals[0]?.toolName).toBe('dangerous');

    const result = await agent.resume(snapshot, {
      decisions: { c2: { decision: 'approve' } },
    });
    // The synthesized resume step contains BOTH tool results so the
    // model sees a complete tool message.
    expect(result.steps[0]?.toolResults).toHaveLength(2);
    expect(result.text).toBe('all done');
  });

  // ----------------------------------------------------------------
  // Snapshot v2 (RFC 0004 §v0.1.9 trust-recovery / RFC 0002 amend)
  // ----------------------------------------------------------------
  describe('snapshot v2 — parsedArgs on resolvedSiblings + migrateSnapshot', () => {
    it('emits version=2 snapshots with parsedArgs populated for every resolvedSibling', async () => {
      const cheap = defineTool({
        name: 'cheap',
        input: z.object({ q: z.string() }),
        execute: ({ q }) => `cheap_done:${q}`,
      });
      const dangerous = defineTool({
        name: 'dangerous',
        input: z.object({ amount: z.number() }),
        requiresApproval: true,
        execute: ({ amount }) => `dangerous_done:${amount}`,
      });
      const agent = createAgent({
        tools: { cheap, dangerous },
        model: scriptedModel([
          toolCallStep([
            { id: 'c1', name: 'cheap', args: { q: 'hello' } },
            { id: 'c2', name: 'dangerous', args: { amount: 42 } },
          ]),
          finalText('done'),
        ]),
      });

      let snapshot: AgentSnapshot | undefined;
      try {
        await agent.run({ prompt: 'go' });
      } catch (err) {
        if (err instanceof AgentSuspendedError) snapshot = err.snapshot;
      }
      if (!snapshot) throw new Error('expected suspension');

      expect(snapshot.version).toBe(CURRENT_SNAPSHOT_VERSION);
      expect(snapshot.version).toBe(2);
      expect(snapshot.resolvedSiblings).toHaveLength(1);
      expect(snapshot.resolvedSiblings[0]?.parsedArgs).toEqual({ q: 'hello' });

      // Resume reconstructs the synthesised tool-call step with the
      // original validated args (not undefined).
      const result = await agent.resume(snapshot, {
        decisions: { c2: { decision: 'approve' } },
      });
      const synth = result.steps[0];
      const cheapCall = synth?.toolCalls.find((c) => c.toolCallId === 'c1');
      expect(cheapCall?.args).toEqual({ q: 'hello' });
      const dangerousCall = synth?.toolCalls.find((c) => c.toolCallId === 'c2');
      // dangerous was approved during resume — its synthesised arg now
      // also flows from parsedInput on the PendingApproval.
      expect(dangerousCall?.args).toEqual({ amount: 42 });
    });

    it('migrateSnapshot upgrades a v1 snapshot to v2 and resume tolerates missing parsedArgs', async () => {
      const cheap = defineTool({
        name: 'cheap',
        input: z.object({}),
        execute: () => 'cheap_done',
      });
      const dangerous = defineTool({
        name: 'dangerous',
        input: z.object({}),
        requiresApproval: true,
        execute: () => 'dangerous_done',
      });
      const agent = createAgent({
        tools: { cheap, dangerous },
        model: scriptedModel([
          toolCallStep([
            { id: 'c1', name: 'cheap', args: {} },
            { id: 'c2', name: 'dangerous', args: {} },
          ]),
          finalText('done'),
        ]),
      });

      let snapshot: AgentSnapshot | undefined;
      try {
        await agent.run({ prompt: 'go' });
      } catch (err) {
        if (err instanceof AgentSuspendedError) snapshot = err.snapshot;
      }
      if (!snapshot) throw new Error('expected suspension');

      // Synthesise a v1-shaped snapshot the way a pre-v0.1.9 client
      // would have produced (no parsedArgs on resolved siblings).
      const v1: AgentSnapshot = {
        ...snapshot,
        version: 1,
        resolvedSiblings: snapshot.resolvedSiblings.map((r) => {
          const { parsedArgs: _parsedArgs, ...rest } = r;
          return rest;
        }),
      };
      expect(v1.resolvedSiblings[0]).not.toHaveProperty('parsedArgs');

      const migrated = migrateSnapshot(v1);
      expect(migrated.version).toBe(2);
      // Migration is conservative: parsedArgs stays undefined for v1
      // siblings (we cannot invent the missing data).
      expect(migrated.resolvedSiblings[0]?.parsedArgs).toBeUndefined();

      // Resume must still succeed (falls back to undefined args).
      const result = await agent.resume(v1, {
        decisions: { c2: { decision: 'approve' } },
      });
      expect(result.text).toBe('done');
    });

    it('migrateSnapshot rejects an unknown future version', () => {
      const future = { version: 99 } as unknown as AgentSnapshot;
      expect(() => migrateSnapshot(future)).toThrow(/version 99/);
    });
  });

  // ----------------------------------------------------------------
  // Checkpointer wiring (RFC 0006 §integration / RFC 0004 §v0.1.9)
  // ----------------------------------------------------------------
  describe('Checkpointer wiring — auto-persist on suspend + resumeFromCheckpoint', () => {
    /** Tiny inline Checkpointer so this test file stays free of cross-package deps. */
    function inlineCheckpointer(): Checkpointer & {
      readonly puts: number;
      readonly snapshots: Map<string, AgentSnapshot[]>;
    } {
      const snapshots = new Map<string, AgentSnapshot[]>();
      let puts = 0;
      return {
        get puts() {
          return puts;
        },
        get snapshots() {
          return snapshots;
        },
        async put(threadId, snap) {
          puts++;
          const id = `cp_${puts}_${Math.random().toString(36).slice(2, 7)}` as CheckpointId;
          const list = snapshots.get(threadId) ?? [];
          list.unshift(structuredClone(snap));
          snapshots.set(threadId, list);
          return id;
        },
        async get(threadId, _id) {
          const list = snapshots.get(threadId);
          if (!list || list.length === 0) return null;
          return structuredClone(list[0] as AgentSnapshot);
        },
        async list(threadId): Promise<CheckpointMeta[]> {
          const list = snapshots.get(threadId) ?? [];
          return list.map((s, i) => ({
            id: `cp_${i}` as CheckpointId,
            threadId,
            createdAt: new Date(),
            agentSnapshotVersion: s.version,
            sizeBytes: 0,
          }));
        },
        async delete(threadId) {
          snapshots.delete(threadId);
        },
      };
    }

    it('auto-persists snapshots from AgentSuspendedError when threadId + checkpointer are configured', async () => {
      const checkpointer = inlineCheckpointer();
      const dangerous = defineTool({
        name: 'dangerous',
        input: z.object({}),
        requiresApproval: true,
        execute: () => 'done',
      });
      const agent = createAgent({
        tools: { dangerous },
        checkpointer,
        defaultThreadId: 'thread-default',
        // Two suspending runs back-to-back — script enough responses
        // for both initial steps (resume is never reached here).
        model: scriptedModel([
          toolCallStep([{ id: 'c1', name: 'dangerous', args: {} }]),
          toolCallStep([{ id: 'c2', name: 'dangerous', args: {} }]),
        ]),
      });

      await expect(agent.run({ prompt: 'go' })).rejects.toBeInstanceOf(AgentSuspendedError);
      expect(checkpointer.puts).toBe(1);
      expect(checkpointer.snapshots.get('thread-default')).toHaveLength(1);

      // Per-call threadId overrides defaultThreadId.
      await expect(
        agent.run({ prompt: 'go again', threadId: 'thread-other' }),
      ).rejects.toBeInstanceOf(AgentSuspendedError);
      expect(checkpointer.puts).toBe(2);
      expect(checkpointer.snapshots.get('thread-other')).toHaveLength(1);
    });

    it('resumeFromCheckpoint loads the latest snapshot and continues the run', async () => {
      const checkpointer = inlineCheckpointer();
      const dangerous = defineTool({
        name: 'dangerous',
        input: z.object({}),
        requiresApproval: true,
        execute: () => 'dangerous_done',
      });
      const agent = createAgent({
        tools: { dangerous },
        checkpointer,
        defaultThreadId: 't1',
        model: scriptedModel([
          toolCallStep([{ id: 'c1', name: 'dangerous', args: {} }]),
          finalText('approved + done'),
        ]),
      });

      // First run suspends; checkpoint was persisted as a side-effect.
      await expect(agent.run({ prompt: 'go' })).rejects.toBeInstanceOf(AgentSuspendedError);

      // Resume purely from the threadId — no snapshot in memory.
      const result = await agent.resumeFromCheckpoint('t1', {
        decisions: { c1: { decision: 'approve' } },
      });
      expect(result.text).toBe('approved + done');
    });

    it('resumeFromCheckpoint throws helpfully when no checkpoint exists', async () => {
      const checkpointer = inlineCheckpointer();
      const agent = createAgent({
        checkpointer,
        model: scriptedModel([finalText('hi')]),
      });
      await expect(agent.resumeFromCheckpoint('nonexistent', { decisions: {} })).rejects.toThrow(
        /No checkpoint found/,
      );
    });

    it('resumeFromCheckpoint requires a checkpointer at construction time', async () => {
      const agent = createAgent({ model: scriptedModel([finalText('hi')]) });
      await expect(agent.resumeFromCheckpoint('t1', { decisions: {} })).rejects.toThrow(
        /requires a `checkpointer`/,
      );
    });

    it('listCheckpoints delegates to checkpointer.list', async () => {
      let listed: { threadId: string; limit?: number } | undefined;
      const cp: Checkpointer = {
        async put() {
          return 'id1' as CheckpointId;
        },
        async get() {
          return null;
        },
        async list(threadId, opts) {
          listed = { threadId, limit: opts?.limit };
          return [];
        },
        async delete() {},
      };
      const agent = createAgent({ model: scriptedModel([finalText('x')]), checkpointer: cp });
      await agent.listCheckpoints('tid', { limit: 5 });
      expect(listed).toEqual({ threadId: 'tid', limit: 5 });
    });

    it('listCheckpoints requires a checkpointer at construction time', async () => {
      const agent = createAgent({ model: scriptedModel([finalText('hi')]) });
      await expect(agent.listCheckpoints('t1')).rejects.toThrow(/requires a `checkpointer`/);
    });

    it('checkpointer.put failure does NOT mask the original AgentSuspendedError', async () => {
      const dangerous = defineTool({
        name: 'dangerous',
        input: z.object({}),
        requiresApproval: true,
        execute: () => 'done',
      });
      const failing: Checkpointer = {
        async put() {
          throw new Error('disk full');
        },
        async get() {
          return null;
        },
        async list() {
          return [];
        },
        async delete() {},
      };
      const agent = createAgent({
        tools: { dangerous },
        checkpointer: failing,
        defaultThreadId: 't1',
        model: scriptedModel([
          toolCallStep([{ id: 'c1', name: 'dangerous', args: {} }]),
          finalText('done'),
        ]),
      });
      const errSpy = (() => {
        const original = console.error;
        const calls: unknown[][] = [];
        console.error = (...args: unknown[]) => calls.push(args);
        return {
          calls,
          restore() {
            console.error = original;
          },
        };
      })();
      try {
        await expect(agent.run({ prompt: 'go' })).rejects.toBeInstanceOf(AgentSuspendedError);
        expect(errSpy.calls.some((c) => String(c[0]).includes('checkpointer.put failed'))).toBe(
          true,
        );
      } finally {
        errSpy.restore();
      }
    });
  });
});
