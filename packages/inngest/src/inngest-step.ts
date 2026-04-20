import type {
  Agent,
  AgentResumeOptions,
  AgentRunOptions,
  AgentRunResult,
  AgentSnapshot,
  CheckpointId,
} from '@ziro-agent/agent';
import { isAgentSuspendedError } from '@ziro-agent/agent';

/**
 * Minimal subset of an Inngest `step` argument we actually use. Typed
 * structurally so we don't import Inngest's full type tree (which is
 * generic across event payloads, schemas, etc) — and so the package can
 * be tested without spinning up an Inngest server.
 *
 * Inngest's real `step` exposes much more (`waitForEvent`, `sleep`,
 * `sendEvent`, parallelism helpers); we only need `run` for the core
 * resumability primitive. Callers compose the rest natively.
 */
export interface InngestStepLike {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>;
}

export interface RunAsStepOptions extends AgentRunOptions {
  /**
   * Stable id used for the `step.run(...)` call. Inngest memoizes by
   * this id within a single function execution; pick a name that is
   * unique within the function or pass `stepIdSuffix` to disambiguate
   * when the same agent runs multiple times in the same workflow.
   *
   * Default: `ziro:agent:run`.
   */
  stepId?: string;
  /**
   * When the agent suspends (HITL), should we persist the snapshot to
   * `agent.checkpointer` automatically? Default `true` when the agent
   * has a checkpointer; ignored otherwise.
   *
   * If you turn this off you MUST persist `error.snapshot` yourself —
   * the `AgentSuspendedError` is rethrown either way so Inngest stops
   * the function execution.
   */
  persistSuspended?: boolean;
}

export interface RunAsStepResult {
  /** Final agent result. Undefined when the run suspended for HITL. */
  result?: AgentRunResult;
  /**
   * Set when the agent suspended via `AgentSuspendedError`. The id is
   * the checkpointId returned by the agent's checkpointer (when
   * `persistSuspended` was enabled). The snapshot is included for
   * convenience; it is also stored in your checkpointer.
   */
  suspended?: {
    snapshot: AgentSnapshot;
    checkpointId?: CheckpointId;
  };
}

/**
 * Run an agent inside an Inngest function step. The standard durable-
 * execution contract applies: if Inngest crashes mid-run and retries
 * the function, the `step.run(...)` boundary memoizes the agent result
 * so the LLM call is not re-issued.
 *
 * NOTE: memoization is at the granularity of the entire agent run, not
 * each LLM step. For finer-grained durability, instead enable the
 * agent's `Checkpointer` and call `runAsStep` repeatedly with the
 * `resumeAsStep` helper after each suspension — Inngest will then only
 * re-issue the steps that have not yet been checkpointed.
 *
 * Suspension behaviour:
 * - When the agent throws `AgentSuspendedError`, the snapshot is
 *   persisted via `agent.checkpointer.put(threadId, snapshot)` (if a
 *   checkpointer is configured and `persistSuspended !== false`).
 * - The error is RETHROWN so Inngest stops the function execution.
 *   Resume by triggering a new function run that calls `resumeAsStep`.
 */
export async function runAsStep(
  step: InngestStepLike,
  agent: Agent,
  options: RunAsStepOptions,
): Promise<RunAsStepResult> {
  const stepId = options.stepId ?? 'ziro:agent:run';
  const { stepId: _ignore1, persistSuspended: _ignore2, ...runOptions } = options;
  void _ignore1;
  void _ignore2;

  try {
    const result = await step.run(stepId, () => agent.run(runOptions));
    return { result };
  } catch (err) {
    if (!isAgentSuspendedError(err)) throw err;

    const persist = options.persistSuspended ?? true;
    const cp = agent.checkpointer;
    const threadId = options.threadId;

    let checkpointId: CheckpointId | undefined;
    if (persist && cp && threadId) {
      checkpointId = await step.run(`${stepId}:persist-suspended`, async () =>
        cp.put(threadId, err.snapshot),
      );
    }

    // Rethrow so Inngest treats this function execution as completed
    // (the snapshot is durably persisted via the checkpointer; the
    // resume happens in a fresh function execution that calls
    // `resumeAsStep`).
    const wrapped = new InngestAgentSuspendedError(err.snapshot, checkpointId);
    throw wrapped;
  }
}

export interface ResumeAsStepOptions extends AgentResumeOptions {
  /** See {@link RunAsStepOptions.stepId}. Default `ziro:agent:resume`. */
  stepId?: string;
  /** See {@link RunAsStepOptions.persistSuspended}. */
  persistSuspended?: boolean;
}

/**
 * Resume an agent run from its latest (or specific) checkpoint inside
 * an Inngest function step. Use after receiving a "human approved"
 * event to continue from where the agent suspended.
 *
 * Throws if the agent has no checkpointer configured or no checkpoint
 * is found for `threadId`.
 */
export async function resumeAsStep(
  step: InngestStepLike,
  agent: Agent,
  threadId: string,
  options: ResumeAsStepOptions & { checkpointId?: CheckpointId },
): Promise<RunAsStepResult> {
  if (!agent.checkpointer) {
    throw new Error(
      'resumeAsStep requires the Agent to be created with a `checkpointer`. ' +
        'Pass one to createAgent({ checkpointer }) or persist the snapshot ' +
        'yourself and call runAsStep with a fresh agent.run snapshot.',
    );
  }
  const stepId = options.stepId ?? 'ziro:agent:resume';
  const persist = options.persistSuspended ?? true;
  const cp = agent.checkpointer;
  const { stepId: _ignore1, persistSuspended: _ignore2, ...resumeOptions } = options;
  void _ignore1;
  void _ignore2;

  try {
    const result = await step.run(stepId, () =>
      agent.resumeFromCheckpoint(threadId, resumeOptions),
    );
    return { result };
  } catch (err) {
    if (!isAgentSuspendedError(err)) throw err;

    let checkpointId: CheckpointId | undefined;
    if (persist) {
      checkpointId = await step.run(`${stepId}:persist-suspended`, async () =>
        cp.put(threadId, err.snapshot),
      );
    }
    const wrapped = new InngestAgentSuspendedError(err.snapshot, checkpointId);
    throw wrapped;
  }
}

/**
 * Wrapper thrown after the original `AgentSuspendedError` has been
 * persisted via the checkpointer. Carries the `checkpointId` so that
 * downstream Inngest event handlers (e.g. an HTTP endpoint that emits
 * the "approved" event) know which checkpoint to resume from.
 *
 * The original `snapshot` is preserved on the `snapshot` field for
 * compatibility with `isAgentSuspendedError`.
 */
export class InngestAgentSuspendedError extends Error {
  override readonly name = 'InngestAgentSuspendedError';
  readonly snapshot: AgentSnapshot;
  readonly checkpointId: CheckpointId | undefined;
  readonly __ziro_suspended__: true = true;

  constructor(snapshot: AgentSnapshot, checkpointId: CheckpointId | undefined) {
    super(
      checkpointId
        ? `Agent suspended (checkpoint ${checkpointId}). Trigger a resume event to continue.`
        : 'Agent suspended (no checkpointer configured). Persist the snapshot manually to resume.',
    );
    this.snapshot = snapshot;
    this.checkpointId = checkpointId;
  }
}
