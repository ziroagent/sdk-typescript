import type { NodeContext, NodeDefinition, NodeResult } from './types.js';

/**
 * Sugar for declaring a strongly-typed node. Compared to writing the object
 * literal by hand it gives you proper inference for the `state` and return
 * types when you pass a generic argument:
 *
 * ```ts
 * defineNode<MyState>({ id: 'fetch', run: async ({ state }) => ({ ... }) })
 * ```
 */
export function defineNode<TState>(def: NodeDefinition<TState>): NodeDefinition<TState> {
  return def;
}

/**
 * Build a node whose only job is to choose the next node based on state.
 * Equivalent to a node that returns `{ next: predicate(state) }`.
 */
export function decisionNode<TState>(opts: {
  id: string;
  decide: (ctx: NodeContext<TState>) => string | string[] | 'end' | Promise<string | string[] | 'end'>;
}): NodeDefinition<TState> {
  return {
    id: opts.id,
    async run(ctx): Promise<NodeResult<TState>> {
      const next = await opts.decide(ctx);
      return { next };
    },
  };
}
