import {
  BudgetExceededError,
  generateText,
  getCurrentBudget,
  type LanguageModel,
  type ModelGenerateResult,
  withBudget,
} from '@ziro-agent/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';
import { executeToolCalls } from './execute.js';

function mockModel(usd = 0.001): LanguageModel {
  return {
    modelId: 'mock',
    provider: 'mock',
    async generate(): Promise<ModelGenerateResult> {
      return {
        text: 'reply',
        content: [{ type: 'text', text: 'reply' }],
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        toolCalls: [],
      };
    },
    async stream() {
      throw new Error('not used');
    },
    estimateCost: () => ({
      minUsd: usd,
      maxUsd: usd,
      minTokens: 10,
      maxTokens: 20,
      pricingAvailable: true,
    }),
  };
}

describe('defineTool({ budget }) — per-tool declared budget', () => {
  it('round-trips the budget field through defineTool', () => {
    const t = defineTool({
      name: 'expensive',
      input: z.object({ q: z.string() }),
      budget: { maxUsd: 0.5, maxLlmCalls: 2 },
      execute: () => 'ok',
    });
    expect(t.budget).toEqual({ maxUsd: 0.5, maxLlmCalls: 2 });
  });

  it('omits budget when not provided', () => {
    const t = defineTool({
      name: 'cheap',
      input: z.object({}),
      execute: () => 'ok',
    });
    expect(t.budget).toBeUndefined();
  });
});

describe('executeToolCalls — budget enforcement', () => {
  it('exposes getCurrentBudget() inside tool.execute when scope is open', async () => {
    let seenScopeId: string | undefined;
    const t = defineTool({
      name: 'introspect',
      input: z.object({}),
      execute: () => {
        seenScopeId = getCurrentBudget()?.scopeId;
        return 'ok';
      },
    });

    await withBudget({ maxUsd: 1 }, async () => {
      await executeToolCalls({
        tools: { introspect: t },
        toolCalls: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'introspect', args: {} }],
        toolBudget: { maxLlmCalls: 5 },
      });
    });

    expect(seenScopeId).toBeDefined();
    expect(seenScopeId).toMatch(/^bg_/);
  });

  it('captures BudgetExceededError as ToolExecutionResult.isError + budgetExceeded', async () => {
    const t = defineTool({
      name: 'doublecall',
      input: z.object({}),
      budget: { maxLlmCalls: 1 },
      execute: async () => {
        const m = mockModel();
        await generateText({ model: m, prompt: 'first' });
        await generateText({ model: m, prompt: 'second' });
        return 'never';
      },
    });

    const [r] = await executeToolCalls({
      tools: { doublecall: t },
      toolCalls: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'doublecall', args: {} }],
    });

    expect(r?.isError).toBe(true);
    expect(r?.budgetExceeded?.kind).toBe('llmCalls');
    expect(r?.budgetExceeded?.limit).toBe(1);
  });

  it('intersects tool.budget with toolBudget (tighter wins)', async () => {
    // tool.budget allows 5 calls, batch toolBudget caps at 1 — the tighter
    // batch limit must win on the SECOND nested generateText call.
    const t = defineTool({
      name: 'chatty',
      input: z.object({}),
      budget: { maxLlmCalls: 5 },
      execute: async () => {
        await generateText({ model: mockModel(), prompt: 'x' });
        await generateText({ model: mockModel(), prompt: 'y' });
        return 'never';
      },
    });

    const [r] = await executeToolCalls({
      tools: { chatty: t },
      toolCalls: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'chatty', args: {} }],
      toolBudget: { maxLlmCalls: 1 },
    });

    expect(r?.isError).toBe(true);
    expect(r?.budgetExceeded?.kind).toBe('llmCalls');
    expect(r?.budgetExceeded?.limit).toBe(1);
  });

  it('does NOT open a scope when no budget is configured anywhere', async () => {
    let scopeIdInside: string | undefined;
    const t = defineTool({
      name: 'free',
      input: z.object({}),
      execute: () => {
        scopeIdInside = getCurrentBudget()?.scopeId;
        return 'ok';
      },
    });

    await executeToolCalls({
      tools: { free: t },
      toolCalls: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'free', args: {} }],
    });

    expect(scopeIdInside).toBeUndefined();
  });

  it('budget on one tool does not affect a sibling tool in the same batch', async () => {
    const limited = defineTool({
      name: 'limited',
      input: z.object({}),
      budget: { maxLlmCalls: 0 },
      execute: async () => {
        await generateText({ model: mockModel(), prompt: 'x' });
        return 'unreachable';
      },
    });
    const free = defineTool({
      name: 'free',
      input: z.object({}),
      execute: async () => 'fine',
    });

    const results = await executeToolCalls({
      tools: { limited, free },
      toolCalls: [
        { type: 'tool-call', toolCallId: 'a', toolName: 'limited', args: {} },
        { type: 'tool-call', toolCallId: 'b', toolName: 'free', args: {} },
      ],
    });

    const a = results.find((r) => r.toolCallId === 'a');
    const b = results.find((r) => r.toolCallId === 'b');
    expect(a?.isError).toBe(true);
    expect(a?.budgetExceeded?.kind).toBe('llmCalls');
    expect(b?.isError).toBe(false);
    expect(b?.result).toBe('fine');
  });

  it('non-budget errors are still surfaced without budgetExceeded field', async () => {
    const t = defineTool({
      name: 'crashes',
      input: z.object({}),
      budget: { maxUsd: 1 },
      execute: () => {
        throw new Error('regular error');
      },
    });

    const [r] = await executeToolCalls({
      tools: { crashes: t },
      toolCalls: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'crashes', args: {} }],
    });

    expect(r?.isError).toBe(true);
    expect(r?.budgetExceeded).toBeUndefined();

    // Verify the error is non-budget without coupling to BudgetExceededError instance.
    void BudgetExceededError;
  });
});
