import {
  type BudgetContext,
  BudgetExceededError,
  type BudgetResolution,
  type LanguageModel,
  type ModelGenerateResult,
} from '@ziro-agent/core';
import { describe, expect, it, vi } from 'vitest';
import { createAgent } from './agent.js';
import type { AgentRunResult } from './types.js';

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

const t = (s: string): ModelGenerateResult => ({
  text: s,
  content: [{ type: 'text', text: s }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

describe('createAgent — onExceed function form (v0.1.6)', () => {
  it('returns the resolver replacement when handled: true', async () => {
    const onExceed = vi.fn(
      async (ctx: BudgetContext): Promise<BudgetResolution> => ({
        handled: true,
        replacement: {
          text: '[fallback agent answer]',
          steps: [],
          totalUsage: {},
          messages: [],
          finishReason: 'completed' as const,
          // Echo back the kind so the test can assert the resolver saw the
          // original error context.
          _resolverSaw: ctx.spec.maxLlmCalls,
        } as AgentRunResult & { _resolverSaw: number | undefined },
      }),
    );

    const agent = createAgent({ model: scriptedModel([t('a'), t('b')]) });
    const result = (await agent.run({
      prompt: 'go',
      budget: { maxLlmCalls: 0, onExceed },
    })) as AgentRunResult & { _resolverSaw?: number };

    expect(onExceed).toHaveBeenCalledOnce();
    expect(result.text).toBe('[fallback agent answer]');
    expect(result.finishReason).toBe('completed');
    expect(result._resolverSaw).toBe(0);
  });

  it('re-throws original BudgetExceededError when resolver returns handled: false', async () => {
    const agent = createAgent({ model: scriptedModel([t('x'), t('y')]) });
    await expect(
      agent.run({
        prompt: 'go',
        budget: { maxLlmCalls: 0, onExceed: () => ({ handled: false }) },
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('surfaces resolver-thrown errors with the original BudgetExceededError as cause', async () => {
    const resolverErr = new Error('resolver blew up');
    const agent = createAgent({ model: scriptedModel([t('x'), t('y')]) });
    let caught: Error | null = null;
    try {
      await agent.run({
        prompt: 'go',
        budget: {
          maxLlmCalls: 0,
          onExceed: () => {
            throw resolverErr;
          },
        },
      });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBe(resolverErr);
    expect((caught as Error & { cause?: unknown }).cause).toBeInstanceOf(BudgetExceededError);
  });

  it('does not invoke the resolver when no overrun occurs', async () => {
    const onExceed = vi.fn();
    const agent = createAgent({ model: scriptedModel([t('done')]) });
    const result = await agent.run({
      prompt: 'hi',
      budget: { maxLlmCalls: 10, onExceed },
    });
    expect(result.finishReason).toBe('completed');
    expect(onExceed).not.toHaveBeenCalled();
  });
});
