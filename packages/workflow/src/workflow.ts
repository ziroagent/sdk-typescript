import type {
  NodeDefinition,
  NodeResult,
  RunWorkflowResult,
  WorkflowEvent,
  WorkflowEventListener,
  WorkflowFinishReason,
} from './types.js';

export interface WorkflowDefinition<TState> {
  /** Initial state. Pass `{}` if your nodes lazily populate it. */
  initialState?: TState;
  /** All nodes in the graph, keyed by id. */
  nodes: Array<NodeDefinition<TState>>;
  /** Entry node id. Defaults to the first node in `nodes`. */
  start?: string;
}

export interface RunWorkflowOptions<TState> {
  /** Override `definition.initialState` for this run. */
  state?: TState;
  abortSignal?: AbortSignal;
  onEvent?: WorkflowEventListener<TState>;
  /**
   * Hard cap on the number of node executions. Protects against runaway
   * cycles in user-authored graphs. Default 100.
   */
  maxNodes?: number;
}

/**
 * Build an immutable workflow definition. Validates that node ids are unique
 * and that every static `edges[]` target exists in the graph.
 */
export function defineWorkflow<TState>(
  def: WorkflowDefinition<TState>,
): WorkflowDefinition<TState> {
  const ids = new Set<string>();
  for (const n of def.nodes) {
    if (ids.has(n.id)) throw new Error(`defineWorkflow: duplicate node id "${n.id}"`);
    ids.add(n.id);
  }
  for (const n of def.nodes) {
    for (const e of n.edges ?? []) {
      if (!ids.has(e)) {
        throw new Error(
          `defineWorkflow: node "${n.id}" has edge to unknown node "${e}"`,
        );
      }
    }
  }
  if (def.start && !ids.has(def.start)) {
    throw new Error(`defineWorkflow: start node "${def.start}" not found`);
  }
  if (def.nodes.length === 0) throw new Error('defineWorkflow: at least one node required');
  return def;
}

/**
 * Execute a workflow. Branches reachable in the same wave run in parallel
 * (`Promise.all`); `state` is merged shallowly after each node and writes
 * are last-writer-wins within a wave (deterministic by node-id sort order).
 *
 * The engine is intentionally minimal — it does not implement persistence,
 * checkpointing, or distributed execution. Those concerns belong in adapters.
 */
export async function runWorkflow<TState>(
  workflow: WorkflowDefinition<TState>,
  options: RunWorkflowOptions<TState> = {},
): Promise<RunWorkflowResult<TState>> {
  const nodes = new Map(workflow.nodes.map((n) => [n.id, n] as const));
  const startId = workflow.start ?? workflow.nodes[0]?.id;
  if (!startId) throw new Error('runWorkflow: workflow has no nodes');

  const initial = (options.state ?? workflow.initialState ?? ({} as TState)) as TState;
  let state: TState = { ...(initial as object) } as TState;

  const visited: string[] = [];
  const maxNodes = options.maxNodes ?? 100;
  const internalAbort = new AbortController();
  const onAbort = () => internalAbort.abort(options.abortSignal?.reason);
  if (options.abortSignal) {
    if (options.abortSignal.aborted) internalAbort.abort(options.abortSignal.reason);
    else options.abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  const emit = async (event: WorkflowEvent<TState>) => {
    if (options.onEvent) await options.onEvent(event);
  };

  let finishReason: WorkflowFinishReason = 'completed';
  let firstError: unknown;

  await emit({ type: 'workflow-start', state });

  let frontier: string[] = [startId];
  try {
    while (frontier.length > 0) {
      if (internalAbort.signal.aborted) {
        finishReason = 'aborted';
        break;
      }
      if (visited.length + frontier.length > maxNodes) {
        finishReason = 'maxNodes';
        break;
      }

      const wave = frontier.slice().sort();
      frontier = [];

      const results = await Promise.all(
        wave.map(async (nodeId) => {
          const node = nodes.get(nodeId);
          if (!node) {
            throw new Error(`runWorkflow: unknown node "${nodeId}"`);
          }
          visited.push(nodeId);
          await emit({ type: 'node-start', nodeId, state });
          try {
            const out = (await node.run({
              state,
              signal: internalAbort.signal,
              nodeId,
              emit: (ev) => {
                void emit(ev);
              },
            })) ?? {};
            await emit({ type: 'node-finish', nodeId, state, result: out });
            return { nodeId, out: out as NodeResult<TState> };
          } catch (err) {
            await emit({ type: 'node-error', nodeId, error: err });
            throw err;
          }
        }),
      );

      // Merge state writes (deterministic order: nodes were sorted above).
      for (const { out } of results) {
        if (out.state) state = { ...state, ...out.state };
      }

      // Compute the next wave.
      const nextSet = new Set<string>();
      for (const { nodeId, out } of results) {
        const def = nodes.get(nodeId);
        if (!def) continue;
        const explicit = out.next;
        if (explicit === 'end') continue;
        if (explicit === undefined) {
          for (const e of def.edges ?? []) nextSet.add(e);
        } else {
          const list = Array.isArray(explicit) ? explicit : [explicit];
          for (const e of list) {
            if (!nodes.has(e)) {
              throw new Error(
                `runWorkflow: node "${nodeId}" returned next="${e}" but no such node exists`,
              );
            }
            nextSet.add(e);
          }
        }
      }
      frontier = Array.from(nextSet);
    }
  } catch (err) {
    firstError = err;
    finishReason = 'error';
    internalAbort.abort(err);
  } finally {
    if (options.abortSignal) options.abortSignal.removeEventListener('abort', onAbort);
  }

  await emit({ type: 'workflow-finish', state, reason: finishReason });

  const result: RunWorkflowResult<TState> = { state, finishReason, visited };
  if (firstError !== undefined) result.error = firstError;
  return result;
}
