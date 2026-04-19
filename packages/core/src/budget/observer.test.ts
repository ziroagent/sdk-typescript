import { afterEach, describe, expect, it } from 'vitest';
import { generateText } from '../generate-text.js';
import type { LanguageModel, ModelGenerateResult } from '../types/model.js';
import type { BudgetExceededError } from './errors.js';
import { _hasObserverForTesting, type BudgetObserver, setBudgetObserver } from './observer.js';
import { withBudget } from './scope.js';
import type { BudgetContext } from './types.js';

afterEach(() => {
  setBudgetObserver(null);
});

describe('BudgetObserver', () => {
  it('installs and uninstalls', () => {
    expect(_hasObserverForTesting()).toBe(false);
    setBudgetObserver({ onScopeStart: () => {} });
    expect(_hasObserverForTesting()).toBe(true);
    setBudgetObserver(null);
    expect(_hasObserverForTesting()).toBe(false);
  });

  it('returns the previous observer when replaced', () => {
    const first: BudgetObserver = { onScopeStart: () => {} };
    const second: BudgetObserver = { onScopeStart: () => {} };
    setBudgetObserver(first);
    const prev = setBudgetObserver(second);
    expect(prev).toBe(first);
  });

  it('fires scope start + end on a successful withBudget run', async () => {
    const events: Array<{ kind: string; ctx: BudgetContext }> = [];
    setBudgetObserver({
      onScopeStart: (ctx) => events.push({ kind: 'start', ctx }),
      onScopeEnd: (ctx, outcome) => events.push({ kind: `end:${outcome}`, ctx }),
    });

    await withBudget({ maxUsd: 1 }, async () => 42);

    expect(events.map((e) => e.kind)).toEqual(['start', 'end:ok']);
    expect(events[0]?.ctx.spec.maxUsd).toBe(1);
  });

  it('fires scope end with outcome=error when fn throws', async () => {
    const ends: string[] = [];
    setBudgetObserver({ onScopeEnd: (_, outcome) => ends.push(outcome) });

    await expect(
      withBudget({ maxUsd: 1 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(ends).toEqual(['error']);
  });

  it('swallows observer exceptions so user code is unaffected', async () => {
    setBudgetObserver({
      onScopeStart: () => {
        throw new Error('observer crash');
      },
      onScopeEnd: () => {
        throw new Error('observer crash');
      },
    });

    const result = await withBudget({ maxUsd: 1 }, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('fires usage update + exceeded around generateText', async () => {
    const updates: BudgetContext[] = [];
    const exceeded: BudgetExceededError[] = [];
    setBudgetObserver({
      onUsageUpdate: (ctx) => updates.push(ctx),
      onExceeded: (_ctx, err) => exceeded.push(err),
    });

    const model: LanguageModel = {
      modelId: 'mock-model',
      provider: 'mock',
      async generate(): Promise<ModelGenerateResult> {
        return {
          text: 'hi',
          content: [{ type: 'text', text: 'hi' }],
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          toolCalls: [],
        };
      },
      async stream() {
        throw new Error('not used');
      },
    };

    await expect(
      generateText({
        model,
        prompt: 'test',
        budget: { maxLlmCalls: 1 },
      }),
    ).resolves.toBeDefined();
    expect(updates.length).toBeGreaterThanOrEqual(1);

    await expect(
      generateText({
        model,
        prompt: 'test',
        budget: { maxLlmCalls: 0 },
      }),
    ).rejects.toThrow();
    expect(exceeded.length).toBe(1);
    expect(exceeded[0]?.kind).toBe('llmCalls');
  });
});
