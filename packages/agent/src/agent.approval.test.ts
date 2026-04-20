import type { Approver, LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import { defineTool } from '@ziro-agent/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';
import { AgentSuspendedError, isAgentSuspendedError } from './snapshot.js';

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
    expect(new Date(snap2!.createdAt).getTime()).toBeGreaterThanOrEqual(
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
});
