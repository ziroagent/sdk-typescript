import { describe, expect, it, vi } from 'vitest';
import { decisionNode, defineNode, defineWorkflow, runWorkflow } from './index.js';
import type { WorkflowEvent } from './types.js';

interface S {
  a?: number;
  b?: number;
  c?: number;
  trail?: string[];
}

describe('defineWorkflow', () => {
  it('rejects duplicate node ids', () => {
    expect(() =>
      defineWorkflow<S>({
        nodes: [
          { id: 'x', run: () => {} },
          { id: 'x', run: () => {} },
        ],
      }),
    ).toThrow(/duplicate/);
  });

  it('rejects edges to unknown nodes', () => {
    expect(() =>
      defineWorkflow<S>({
        nodes: [{ id: 'x', edges: ['y'], run: () => {} }],
      }),
    ).toThrow(/unknown node/);
  });

  it('rejects unknown start node', () => {
    expect(() =>
      defineWorkflow<S>({ nodes: [{ id: 'x', run: () => {} }], start: 'y' }),
    ).toThrow(/start node/);
  });

  it('requires at least one node', () => {
    expect(() => defineWorkflow<S>({ nodes: [] })).toThrow();
  });
});

describe('runWorkflow', () => {
  it('runs a simple linear graph and merges state', async () => {
    const wf = defineWorkflow<S>({
      initialState: { trail: [] },
      nodes: [
        defineNode<S>({
          id: 'a',
          edges: ['b'],
          run: ({ state }) => ({ state: { trail: [...(state.trail ?? []), 'a'], a: 1 } }),
        }),
        defineNode<S>({
          id: 'b',
          run: ({ state }) => ({ state: { trail: [...(state.trail ?? []), 'b'], b: 2 } }),
        }),
      ],
    });
    const result = await runWorkflow(wf);
    expect(result.finishReason).toBe('completed');
    expect(result.state).toMatchObject({ a: 1, b: 2, trail: ['a', 'b'] });
    expect(result.visited).toEqual(['a', 'b']);
  });

  it('runs branches in parallel and merges their writes', async () => {
    const wf = defineWorkflow<S>({
      nodes: [
        defineNode<S>({ id: 'start', edges: ['p1', 'p2'], run: () => ({}) }),
        defineNode<S>({
          id: 'p1',
          run: async () => {
            await new Promise((r) => setTimeout(r, 5));
            return { state: { a: 1 } };
          },
        }),
        defineNode<S>({
          id: 'p2',
          run: async () => {
            await new Promise((r) => setTimeout(r, 1));
            return { state: { b: 2 } };
          },
        }),
      ],
    });
    const result = await runWorkflow(wf);
    expect(result.state).toMatchObject({ a: 1, b: 2 });
    expect(result.visited).toContain('p1');
    expect(result.visited).toContain('p2');
  });

  it('respects dynamic next from node result', async () => {
    const wf = defineWorkflow<S>({
      nodes: [
        defineNode<S>({ id: 'start', run: () => ({ next: 'right' }) }),
        defineNode<S>({ id: 'left', run: () => ({ state: { a: 1 } }) }),
        defineNode<S>({ id: 'right', run: () => ({ state: { b: 1 } }) }),
      ],
    });
    const result = await runWorkflow(wf);
    expect(result.visited).toEqual(['start', 'right']);
    expect(result.state.b).toBe(1);
    expect(result.state.a).toBeUndefined();
  });

  it('terminates a branch when next is "end"', async () => {
    const wf = defineWorkflow<S>({
      nodes: [
        defineNode<S>({ id: 'start', edges: ['next'], run: () => ({ next: 'end' }) }),
        defineNode<S>({ id: 'next', run: () => ({ state: { a: 1 } }) }),
      ],
    });
    const result = await runWorkflow(wf);
    expect(result.visited).toEqual(['start']);
    expect(result.state.a).toBeUndefined();
  });

  it('decisionNode picks branches', async () => {
    const wf = defineWorkflow<S>({
      initialState: { a: 5 },
      nodes: [
        decisionNode<S>({
          id: 'router',
          decide: ({ state }) => ((state.a ?? 0) > 3 ? 'big' : 'small'),
        }),
        defineNode<S>({ id: 'big', run: () => ({ state: { c: 100 } }) }),
        defineNode<S>({ id: 'small', run: () => ({ state: { c: 1 } }) }),
      ],
    });
    const result = await runWorkflow(wf);
    expect(result.state.c).toBe(100);
  });

  it('emits workflow + node lifecycle events', async () => {
    const events: Array<WorkflowEvent<S>['type']> = [];
    const wf = defineWorkflow<S>({
      nodes: [defineNode<S>({ id: 'a', run: () => ({}) })],
    });
    await runWorkflow(wf, { onEvent: (e) => void events.push(e.type) });
    expect(events).toEqual([
      'workflow-start',
      'node-start',
      'node-finish',
      'workflow-finish',
    ]);
  });

  it('captures node errors and stops with finishReason "error"', async () => {
    const wf = defineWorkflow<S>({
      nodes: [
        defineNode<S>({
          id: 'boom',
          run: () => {
            throw new Error('kaboom');
          },
        }),
      ],
    });
    const result = await runWorkflow(wf);
    expect(result.finishReason).toBe('error');
    expect((result.error as Error).message).toBe('kaboom');
  });

  it('respects abortSignal', async () => {
    const ac = new AbortController();
    const wf = defineWorkflow<S>({
      nodes: [
        defineNode<S>({
          id: 'a',
          edges: ['b'],
          run: () => {
            ac.abort();
          },
        }),
        defineNode<S>({ id: 'b', run: () => ({ state: { a: 99 } }) }),
      ],
    });
    const result = await runWorkflow(wf, { abortSignal: ac.signal });
    expect(result.finishReason).toBe('aborted');
    expect(result.state.a).toBeUndefined();
  });

  it('enforces maxNodes', async () => {
    const wf = defineWorkflow<S>({
      nodes: [
        defineNode<S>({ id: 'a', edges: ['b'], run: () => ({}) }),
        defineNode<S>({ id: 'b', edges: ['a'], run: () => ({}) }),
      ],
    });
    const result = await runWorkflow(wf, { maxNodes: 4 });
    expect(result.finishReason).toBe('maxNodes');
    expect(result.visited.length).toBeLessThanOrEqual(4);
  });

  it('rejects dynamic next pointing to unknown node', async () => {
    const wf = defineWorkflow<S>({
      nodes: [defineNode<S>({ id: 'a', run: () => ({ next: 'nope' }) })],
    });
    const result = await runWorkflow(wf);
    expect(result.finishReason).toBe('error');
    expect(String((result.error as Error).message)).toMatch(/no such node/);
  });

  it('exposes ctx.emit for custom events', async () => {
    const onEvent = vi.fn();
    const wf = defineWorkflow<S>({
      nodes: [
        defineNode<S>({
          id: 'a',
          run: ({ emit }) => {
            emit({ type: 'custom', nodeId: 'a', payload: { hello: 'world' } });
          },
        }),
      ],
    });
    await runWorkflow(wf, { onEvent });
    const customCalls = onEvent.mock.calls.filter(([e]) => e.type === 'custom');
    expect(customCalls).toHaveLength(1);
  });
});
