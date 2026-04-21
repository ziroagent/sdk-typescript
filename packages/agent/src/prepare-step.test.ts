import type { ChatMessage, LanguageModel } from '@ziro-agent/core';
import { defineTool } from '@ziro-agent/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { resolvePrepareForStep } from './prepare-step.js';

function stubModel(): LanguageModel {
  return {
    modelId: 'stub',
    provider: 'mock',
    async generate() {
      throw new Error('not used');
    },
    async stream() {
      throw new Error('not used');
    },
    estimateCost: () => ({
      minUsd: 0,
      maxUsd: 0,
      minTokens: 1,
      maxTokens: 2,
      pricingAvailable: true,
    }),
  };
}

describe('resolvePrepareForStep', () => {
  it('replaces the first system message when result.system is set', async () => {
    const tools = { a: defineTool({ name: 'a', input: z.object({}), execute: () => 1 }) };
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'base' },
      { role: 'user', content: 'hi' },
    ];
    const out = await resolvePrepareForStep(
      async () => ({ system: 'OVERRIDE' }),
      1,
      msgs,
      stubModel(),
      tools,
    );
    expect(out.messages[0]).toEqual({ role: 'system', content: 'OVERRIDE' });
    expect(out.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('prepends system when none exists', async () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: 'hi' }];
    const out = await resolvePrepareForStep(
      async () => ({ system: 'ONLY' }),
      1,
      msgs,
      stubModel(),
      {},
    );
    expect(out.messages[0]).toEqual({ role: 'system', content: 'ONLY' });
    expect(out.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('filters activeTools to known tool names only', async () => {
    const tools = {
      a: defineTool({ name: 'a', input: z.object({}), execute: () => 1 }),
      b: defineTool({ name: 'b', input: z.object({}), execute: () => 2 }),
    };
    const out = await resolvePrepareForStep(
      async () => ({ activeTools: ['b', 'ghost'] }),
      1,
      [{ role: 'user', content: 'x' }],
      stubModel(),
      tools,
    );
    expect(Object.keys(out.toolsForStep)).toEqual(['b']);
  });

  it('returns undefined toolDefs when activeTools is empty', async () => {
    const tools = {
      a: defineTool({ name: 'a', input: z.object({}), execute: () => 1 }),
    };
    const out = await resolvePrepareForStep(
      async () => ({ activeTools: [] }),
      1,
      [{ role: 'user', content: 'x' }],
      stubModel(),
      tools,
    );
    expect(out.toolDefs).toBeUndefined();
    expect(Object.keys(out.toolsForStep)).toHaveLength(0);
  });
});
