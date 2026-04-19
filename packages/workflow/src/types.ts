/**
 * Per-run context passed to every node `run` function. The framework owns
 * `signal` and `emit`; everything else is opaque user state.
 */
export interface NodeContext<TState> {
  /** The shared, mutable workflow state at the time the node started. */
  state: TState;
  /** Aborts when the workflow is aborted by the caller or by an error in another branch. */
  signal: AbortSignal;
  /** The id of the node currently running. */
  nodeId: string;
  /** Emit a custom event onto the workflow event stream. */
  emit(event: WorkflowEvent<TState>): void;
}

/**
 * The result of a node. `state` is merged shallowly into the workflow state;
 * `next` overrides static edges and explicitly selects the next node(s) to
 * execute. Returning `next: 'end'` (or `[]`) terminates this branch.
 */
export interface NodeResult<TState> {
  state?: Partial<TState>;
  next?: string | string[] | 'end';
}

/** A single computational unit in the graph. */
export interface NodeDefinition<TState> {
  id: string;
  /** Static outgoing edges. Ignored if `run` returns `next`. */
  edges?: string[];
  run(
    ctx: NodeContext<TState>,
  ): Promise<NodeResult<TState> | undefined> | NodeResult<TState> | undefined;
}

/** Fired throughout a workflow run; subscribe via `runWorkflow({ onEvent })`. */
export type WorkflowEvent<TState> =
  | { type: 'workflow-start'; state: TState }
  | { type: 'node-start'; nodeId: string; state: TState }
  | { type: 'node-finish'; nodeId: string; state: TState; result: NodeResult<TState> }
  | { type: 'node-error'; nodeId: string; error: unknown }
  | { type: 'workflow-finish'; state: TState; reason: WorkflowFinishReason }
  | { type: 'custom'; nodeId: string; payload: unknown };

export type WorkflowFinishReason = 'completed' | 'aborted' | 'error' | 'maxNodes';

export type WorkflowEventListener<TState> = (event: WorkflowEvent<TState>) => void | Promise<void>;

export interface RunWorkflowResult<TState> {
  state: TState;
  finishReason: WorkflowFinishReason;
  /** Ordered list of node ids that started executing. */
  visited: string[];
  /** First error captured by the engine, if any. */
  error?: unknown;
}
