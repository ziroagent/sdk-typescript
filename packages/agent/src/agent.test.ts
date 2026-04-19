import type { LanguageModel, ModelGenerateResult, ToolCallPart } from '@ziroagent/core';
import { defineTool } from '@ziroagent/tools';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';
import { stepCountIs } from './stop-when.js';

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
    async stream(): Promise<ReadableStream> {
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

const toolCall = (
  toolName: string,
  args: unknown,
  toolCallId = 'c1',
): ModelGenerateResult => {
  const tc: ToolCallPart = { type: 'tool-call', toolCallId, toolName, args };
  return {
    text: '',
    content: [tc],
    toolCalls: [tc],
    finishReason: 'tool-calls',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };
};

describe('createAgent', () => {
  it('returns text on a no-tool reply', async () => {
    const agent = createAgent({ model: scriptedModel([text('hello')]) });
    const result = await agent.run({ prompt: 'hi' });
    expect(result.text).toBe('hello');
    expect(result.steps).toHaveLength(1);
    expect(result.finishReason).toBe('completed');
  });

  it('runs the tool loop', async () => {
    const getWeather = defineTool({
      name: 'getWeather',
      input: z.object({ city: z.string() }),
      execute: ({ city }) => ({ temp: 30, city }),
    });

    const model = scriptedModel([
      toolCall('getWeather', { city: 'Hanoi' }),
      text('It is 30°C in Hanoi.'),
    ]);

    const agent = createAgent({ model, tools: { getWeather } });
    const result = await agent.run({ prompt: 'Weather in Hanoi?' });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]?.toolCalls).toHaveLength(1);
    expect(result.steps[0]?.toolResults[0]?.result).toEqual({ temp: 30, city: 'Hanoi' });
    expect(result.text).toBe('It is 30°C in Hanoi.');
    expect(result.totalUsage.totalTokens).toBe(4);
  });

  it('emits step events in order', async () => {
    const getWeather = defineTool({
      name: 'getWeather',
      input: z.object({ city: z.string() }),
      execute: ({ city }) => ({ temp: 30, city }),
    });

    const model = scriptedModel([
      toolCall('getWeather', { city: 'Hanoi' }),
      text('done'),
    ]);
    const agent = createAgent({ model, tools: { getWeather } });
    const events: string[] = [];
    await agent.run({
      prompt: 'x',
      onEvent: (e) => {
        events.push(e.type);
      },
    });

    expect(events).toEqual([
      'step-start',
      'llm-finish',
      'tool-result',
      'step-finish',
      'step-start',
      'llm-finish',
      'step-finish',
      'agent-finish',
    ]);
  });

  it('respects maxSteps when model keeps calling tools', async () => {
    const tool = defineTool({
      name: 'loop',
      input: z.object({}),
      execute: () => 'ok',
    });
    const model = scriptedModel([
      toolCall('loop', {}, 'a'),
      toolCall('loop', {}, 'b'),
      toolCall('loop', {}, 'c'),
      toolCall('loop', {}, 'd'),
    ]);
    const agent = createAgent({ model, tools: { loop: tool }, maxSteps: 3 });
    const result = await agent.run({ prompt: 'loop' });
    expect(result.steps).toHaveLength(3);
    expect(result.finishReason).toBe('maxSteps');
  });

  it('respects custom stopWhen', async () => {
    const tool = defineTool({ name: 't', input: z.object({}), execute: () => 'ok' });
    const model = scriptedModel([
      toolCall('t', {}, 'a'),
      toolCall('t', {}, 'b'),
      toolCall('t', {}, 'c'),
    ]);
    const agent = createAgent({
      model,
      tools: { t: tool },
      maxSteps: 10,
      stopWhen: stepCountIs(2),
    });
    const result = await agent.run({ prompt: 'x' });
    expect(result.steps).toHaveLength(2);
    expect(result.finishReason).toBe('stopWhen');
  });

  it('aborts mid-loop when AbortSignal fires before next step', async () => {
    const tool = defineTool({ name: 't', input: z.object({}), execute: () => 'ok' });
    const ac = new AbortController();
    const model: LanguageModel = {
      modelId: 'm',
      provider: 'm',
      async generate() {
        ac.abort();
        return toolCall('t', {}, 'x');
      },
      async stream() {
        throw new Error('not impl');
      },
    };
    const agent = createAgent({ model, tools: { t: tool } });
    const result = await agent.run({ prompt: 'x', abortSignal: ac.signal });
    expect(result.finishReason).toBe('aborted');
  });

  it('honours system prompt', async () => {
    const captured: { messages: unknown[] }[] = [];
    const model: LanguageModel = {
      modelId: 'm',
      provider: 'm',
      generate: vi.fn(async (opts) => {
        captured.push({ messages: opts.messages });
        return text('ok');
      }),
      async stream() {
        throw new Error('x');
      },
    };
    const agent = createAgent({ model, system: 'Be brief.' });
    await agent.run({ prompt: 'hi' });
    expect((captured[0]?.messages as Array<{ role: string }>)[0]?.role).toBe('system');
  });
});
