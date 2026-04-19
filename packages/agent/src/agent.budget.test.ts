import {
  BudgetExceededError,
  type LanguageModel,
  type ModelGenerateResult,
  type ToolCallPart,
} from '@ziro-agent/core';
import { defineTool } from '@ziro-agent/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';
import type { StepEvent } from './types.js';

function scriptedModel(responses: ModelGenerateResult[]): LanguageModel {
  let i = 0;
  return {
    modelId: 'mock',
    provider: 'mock',
    async generate(): Promise<ModelGenerateResult> {
      const r = responses[i++];
      if (!r) throw new Error('Mock model exhausted');
      return r;
    },
    async stream() {
      throw new Error('not implemented');
    },
  };
}

const text = (t: string): ModelGenerateResult => ({
  text: t,
  content: [{ type: 'text', text: t }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

const toolCall = (toolName: string, args: unknown, toolCallId = 'c1'): ModelGenerateResult => {
  const tc: ToolCallPart = { type: 'tool-call', toolCallId, toolName, args };
  return {
    text: '',
    content: [tc],
    toolCalls: [tc],
    finishReason: 'tool-calls',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };
};

describe('createAgent — budget integration', () => {
  it('runs a complete loop within an unbounded budget', async () => {
    const agent = createAgent({ model: scriptedModel([text('done')]) });
    const result = await agent.run({
      prompt: 'hi',
      budget: { maxLlmCalls: 10 },
    });
    expect(result.finishReason).toBe('completed');
    expect(result.text).toBe('done');
    expect(result.budgetExceeded).toBeUndefined();
  });

  it('throws BudgetExceededError when maxLlmCalls is hit (default onExceed: throw)', async () => {
    const tool = defineTool({
      name: 'noop',
      input: z.object({}),
      execute: () => ({ ok: true }),
    });
    const model = scriptedModel([toolCall('noop', {}), toolCall('noop', {}, 'c2'), text('never')]);
    const agent = createAgent({ model, tools: { noop: tool } });

    await expect(
      agent.run({
        prompt: 'go',
        budget: { maxLlmCalls: 1 },
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('truncates and returns partial result when onExceed: truncate', async () => {
    const tool = defineTool({
      name: 'noop',
      input: z.object({}),
      execute: () => ({ ok: true }),
    });
    const model = scriptedModel([toolCall('noop', {}), toolCall('noop', {}, 'c2'), text('never')]);
    const agent = createAgent({ model, tools: { noop: tool } });

    const result = await agent.run({
      prompt: 'go',
      budget: { maxLlmCalls: 1, onExceed: 'truncate' },
    });

    expect(result.finishReason).toBe('budgetExceeded');
    expect(result.budgetExceeded?.kind).toBe('llmCalls');
    expect(result.budgetExceeded?.limit).toBe(1);
    expect(result.budgetExceeded?.origin).toBe('preflight');
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('honors BudgetSpec.maxSteps as the tighter cap vs CreateAgentOptions.maxSteps', async () => {
    const tool = defineTool({
      name: 'noop',
      input: z.object({}),
      execute: () => ({ ok: true }),
    });
    const model = scriptedModel([
      toolCall('noop', {}),
      toolCall('noop', {}, 'c2'),
      toolCall('noop', {}, 'c3'),
      text('never'),
    ]);
    const agent = createAgent({ model, tools: { noop: tool }, maxSteps: 5 });

    const result = await agent.run({
      prompt: 'go',
      budget: { maxSteps: 2 },
    });

    expect(result.finishReason).toBe('maxSteps');
    expect(result.steps).toHaveLength(2);
  });

  it('emits a budget-exceeded step event before finish', async () => {
    const tool = defineTool({
      name: 'noop',
      input: z.object({}),
      execute: () => ({ ok: true }),
    });
    const model = scriptedModel([toolCall('noop', {}), toolCall('noop', {}, 'c2'), text('never')]);
    const agent = createAgent({ model, tools: { noop: tool } });
    const events: StepEvent[] = [];

    await agent.run({
      prompt: 'go',
      budget: { maxLlmCalls: 1, onExceed: 'truncate' },
      onEvent: (e) => {
        events.push(e);
      },
    });

    const types = events.map((e) => e.type);
    const exIdx = types.indexOf('budget-exceeded');
    const finIdx = types.indexOf('agent-finish');
    expect(exIdx).toBeGreaterThanOrEqual(0);
    expect(finIdx).toBeGreaterThan(exIdx);
  });

  it('promotes a tool-level budget overrun into an agent budget halt', async () => {
    // Tool's declared budget refuses any nested LLM call. Tool itself is a
    // pure function so it never tries one — the limit trips when the agent
    // makes ITS llmCall, not when the tool runs. So we exercise the
    // promotion path by giving the toolBudget the constraint and having the
    // tool burn it via a fake nested call.

    // Easiest scriptable variant: the tool returns a budgetExceeded result
    // directly is NOT possible (executeToolCalls wouldn't synthesize one).
    // Instead use a real nested generateText inside the tool with maxLlmCalls=0.
    const innerModel = scriptedModel([text('inner')]);
    const tool = defineTool({
      name: 'callsLLM',
      input: z.object({}),
      budget: { maxLlmCalls: 0 },
      execute: async () => {
        const { generateText } = await import('@ziro-agent/core');
        await generateText({ model: innerModel, prompt: 'x' });
        return 'unreachable';
      },
    });

    const model = scriptedModel([toolCall('callsLLM', {}), text('never')]);
    const agent = createAgent({ model, tools: { callsLLM: tool } });

    const result = await agent.run({
      prompt: 'go',
      budget: { maxLlmCalls: 5, onExceed: 'truncate' },
    });

    expect(result.finishReason).toBe('budgetExceeded');
    expect(result.budgetExceeded?.origin).toBe('tool');
    expect(result.budgetExceeded?.kind).toBe('llmCalls');
  });

  it('toolBudget is applied per-tool inside executeToolCalls', async () => {
    const innerModel = scriptedModel([text('one')]);
    const tool = defineTool({
      name: 'chatty',
      input: z.object({}),
      execute: async () => {
        const { generateText } = await import('@ziro-agent/core');
        await generateText({ model: innerModel, prompt: 'x' });
        return 'ok';
      },
    });

    const model = scriptedModel([toolCall('chatty', {}), text('done')]);
    const agent = createAgent({ model, tools: { chatty: tool } });

    const result = await agent.run({
      prompt: 'go',
      budget: { maxLlmCalls: 10, onExceed: 'truncate' },
      toolBudget: { maxLlmCalls: 0 },
    });

    // Tool failed because toolBudget refused the nested call; agent then
    // sees the budget hit and halts via the tool-promotion path.
    expect(result.finishReason).toBe('budgetExceeded');
    expect(result.budgetExceeded?.origin).toBe('tool');
  });

  it('does NOT open a scope when no budget is passed (back-compat with v0.1.4)', async () => {
    // Sanity: behaviour without `budget` is identical to the v0.1.4 baseline.
    const agent = createAgent({ model: scriptedModel([text('plain')]) });
    const result = await agent.run({ prompt: 'hi' });
    expect(result.finishReason).toBe('completed');
    expect(result.budgetExceeded).toBeUndefined();
  });
});
