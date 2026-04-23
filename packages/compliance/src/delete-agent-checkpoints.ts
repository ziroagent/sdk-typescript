/**
 * Bridges {@link Checkpointer} (RFC 0006) into {@link DeleteUserDataHooks}
 * (RFC 0016) without pulling `@ziro-agent/agent` into this package.
 */

/**
 * Minimal delete surface — matches {@link Checkpointer#delete} from
 * `@ziro-agent/agent` so real checkpointers satisfy this structurally.
 */
export interface AgentCheckpointThreadDeleter {
  delete(threadId: string, checkpointId?: string): Promise<void>;
}

/** Deletes all checkpoints for each thread id (parallel, best-effort ordering). */
export async function deleteAgentCheckpointsForThreads(
  checkpointer: AgentCheckpointThreadDeleter,
  threadIds: readonly string[],
): Promise<void> {
  await Promise.all(threadIds.map((tid) => checkpointer.delete(tid)));
}
