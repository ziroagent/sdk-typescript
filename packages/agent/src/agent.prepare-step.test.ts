import type { LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import { defineTool } from '@ziro-agent/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';

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
    type: 'tool-call' as const,
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

describe('createAgent — prepareStep', () => {
  it('swaps model from step 2 onward', async () => {
    const used: string[] = [];
    const primary: LanguageModel = {
      modelId: 'primary',
      provider: 'mock',
      async generate() {
        used.push('primary');
        return toolCallStep([{ id: 'c1', name: 'noop', args: {} }]);
      },
      async stream() {
        throw new Error('not implemented');
      },
      estimateCost: () => ({
        minUsd: 0.001,
        maxUsd: 0.001,
        minTokens: 1,
        maxTokens: 2,
        pricingAvailable: true,
      }),
    };
    const secondary: LanguageModel = {
      modelId: 'secondary',
      provider: 'mock',
      async generate() {
        used.push('secondary');
        return finalText('done');
      },
      async stream() {
        throw new Error('not implemented');
      },
      estimateCost: () => ({
        minUsd: 0.001,
        maxUsd: 0.001,
        minTokens: 1,
        maxTokens: 2,
        pricingAvailable: true,
      }),
    };

    const noop = defineTool({
      name: 'noop',
      input: z.object({}),
      execute: () => 'ok',
    });

    const agent = createAgent({
      model: primary,
      tools: { noop },
      prepareStep: ({ stepIndex }) => (stepIndex >= 2 ? { model: secondary } : {}),
    });

    const result = await agent.run({
      prompt: 'run',
      budget: { maxUsdPerRun: 1 },
    });
    expect(result.text).toBe('done');
    expect(used).toEqual(['primary', 'secondary']);
  });

  it('per-run prepareStep overrides createAgent default', async () => {
    const order: string[] = [];
    const mk = (tag: string, out: ModelGenerateResult): LanguageModel => ({
      modelId: tag,
      provider: 'mock',
      async generate() {
        order.push(tag);
        return out;
      },
      async stream() {
        throw new Error('not implemented');
      },
      estimateCost: () => ({
        minUsd: 0.001,
        maxUsd: 0.001,
        minTokens: 1,
        maxTokens: 2,
        pricingAvailable: true,
      }),
    });

    const noop = defineTool({
      name: 'noop',
      input: z.object({}),
      execute: () => 'ok',
    });

    const agent = createAgent({
      model: mk('A', toolCallStep([{ id: 'c1', name: 'noop', args: {} }])),
      tools: { noop },
      prepareStep: () => ({ model: mk('B', finalText('from-B')) }),
    });

    await agent.run({
      prompt: 'x',
      budget: { maxUsdPerRun: 1 },
      prepareStep: () => ({ model: mk('C', finalText('from-C')) }),
    });
    expect(order).toEqual(['C']);
  });
});
