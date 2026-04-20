import type { LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import { describe, expect, it, vi } from 'vitest';
import { type Agent, createAgent } from './agent.js';
import { createNetwork } from './network.js';

const finalText = (s: string): ModelGenerateResult => ({
  text: s,
  content: [{ type: 'text', text: s }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

const oneShotModel = (text: string): LanguageModel => ({
  modelId: 'mock',
  provider: 'mock',
  async generate() {
    return finalText(text);
  },
  async stream() {
    throw new Error('not implemented');
  },
});

describe('createNetwork (RFC 0007)', () => {
  it('runs agents in the order the router dictates and halts on undefined', async () => {
    const a = createAgent({ name: 'a', model: oneShotModel('a-out') });
    const b = createAgent({ name: 'b', model: oneShotModel('b-out') });
    const c = createAgent({ name: 'c', model: oneShotModel('c-out') });

    const seq: Agent[] = [a, b, c];
    const router = vi.fn(({ stepIndex }: { stepIndex: number }) => seq[stepIndex]);

    const net = createNetwork({ agents: seq, router });
    const result = await net.run({ prompt: 'kick off' });

    expect(result.steps).toHaveLength(3);
    expect(result.steps.map((s) => s.agents[0]?.name)).toEqual(['a', 'b', 'c']);
    expect(result.text).toBe('c-out');
    expect(result.finishReason).toBe('router-halt');
    // Router was called 4 times: 3 picks + 1 final undefined.
    expect(router).toHaveBeenCalledTimes(4);
  });

  it('exposes lastAgent + lastResult to the router on subsequent steps', async () => {
    const a = createAgent({ name: 'a', model: oneShotModel('alpha') });
    const b = createAgent({ name: 'b', model: oneShotModel('beta') });

    const seenLastAgent: Array<string | undefined> = [];
    const seenLastText: Array<string | undefined> = [];

    const net = createNetwork({
      agents: [a, b],
      router: ({ stepIndex, lastAgent, lastResult }) => {
        seenLastAgent.push(lastAgent?.name);
        seenLastText.push(lastResult?.text);
        if (stepIndex === 0) return a;
        if (stepIndex === 1) return b;
        return undefined;
      },
    });

    await net.run({ prompt: 'go' });
    expect(seenLastAgent).toEqual([undefined, 'a', 'b']);
    expect(seenLastText).toEqual([undefined, 'alpha', 'beta']);
  });

  it('runs agents in parallel when the router returns Agent[]', async () => {
    const a = createAgent({ name: 'a', model: oneShotModel('alpha') });
    const b = createAgent({ name: 'b', model: oneShotModel('beta') });

    const net = createNetwork({
      agents: [a, b],
      router: ({ stepIndex }) => {
        if (stepIndex === 0) return [a, b];
        return undefined;
      },
    });

    const result = await net.run({ prompt: 'fan out' });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.results.map((r) => r.text)).toEqual(['alpha', 'beta']);
    // Primary (text) follows the FIRST result in the parallel batch.
    expect(result.text).toBe('alpha');
  });

  it('halts with finishReason="maxSteps" when the cap is hit before the router returns undefined', async () => {
    const a = createAgent({ name: 'a', model: oneShotModel('a') });
    const net = createNetwork({
      agents: [a],
      router: () => a, // never halts
      maxSteps: 3,
    });

    const result = await net.run({ prompt: 'forever' });
    expect(result.steps).toHaveLength(3);
    expect(result.finishReason).toBe('maxSteps');
  });

  it('treats router returning [] the same as undefined (halts immediately)', async () => {
    const a = createAgent({ name: 'a', model: oneShotModel('a') });
    const net = createNetwork({
      agents: [a],
      router: () => [],
    });

    const result = await net.run({ prompt: 'noop' });
    expect(result.steps).toHaveLength(0);
    expect(result.finishReason).toBe('router-halt');
    expect(result.text).toBe('');
  });

  it('threads mutable state through every router invocation', async () => {
    const a = createAgent({ name: 'a', model: oneShotModel('a-out') });
    const seenStates: Array<Record<string, unknown>> = [];

    const net = createNetwork({
      agents: [a],
      router: ({ stepIndex, state }) => {
        seenStates.push({ ...state });
        if (stepIndex === 0) {
          state.phase = 'second';
          return a;
        }
        if (stepIndex === 1 && state.phase === 'second') {
          state.phase = 'done';
          return a;
        }
        return undefined;
      },
    });

    const result = await net.run({ prompt: 'state', initialState: { phase: 'first' } });
    expect(seenStates.map((s) => s.phase)).toEqual(['first', 'second', 'done']);
    expect(result.state.phase).toBe('done');
  });
});
