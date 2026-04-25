import type { AgentSnapshot } from './snapshot.js';

/**
 * Opaque, time-sortable checkpoint identifier. Implementations SHOULD use
 * UUID v7 so `list()` results are naturally chronological without an
 * extra `ORDER BY createdAt`. Callers MUST treat this as opaque.
 *
 * Stable since v0.1.9 / RFC 0006 §types.
 */
export type CheckpointId = string;

/**
 * Lightweight metadata returned by {@link Checkpointer.list} — enough to
 * page a UI / pick a target without fully deserializing the snapshot.
 *
 * `sizeBytes` is best-effort; adapters that cannot cheaply measure
 * (Redis MGET, etc.) MAY report 0 and document the gap.
 */
export interface CheckpointMeta {
  id: CheckpointId;
  threadId: string;
  createdAt: Date;
  /** Echoes `snapshot.version` at write time so consumers can plan migrations. */
  agentSnapshotVersion: number;
  sizeBytes: number;
}

/**
 * Persistence boundary for {@link AgentSnapshot}s — the durable side of
 * an agent run that pauses for HITL, hits a budget cap with `truncate`,
 * is intentionally suspended, or simply needs to survive a process
 * restart.
 *
 * **Contract** (RFC 0006 §interface):
 * - `put` MUST be atomic per `(threadId, returned id)`. The returned
 *   `CheckpointId` is the only handle the caller will quote later.
 * - `get(threadId)` returns the *latest* checkpoint for the thread, or
 *   `null` if none exist. `get(threadId, id)` returns the exact one or
 *   `null` if it has been deleted / expired / never written.
 * - `list` is ordered newest → oldest. `limit` defaults to
 *   implementation-specific (memory adapter: 100).
 * - `delete(threadId)` removes ALL checkpoints for the thread.
 *   `delete(threadId, id)` removes only that checkpoint.
 * - All methods MUST be safe to call concurrently from the same
 *   process; cross-process atomicity is the storage adapter's
 *   responsibility (Postgres: row-level lock; Redis: single-key set).
 *
 * Implementations live in dedicated adapter packages
 * (`@ziro-agent/checkpoint-memory`, `@ziro-agent/checkpoint-postgres`,
 * `@ziro-agent/checkpoint-redis`) so the agent core stays free of
 * driver dependencies. See RFC 0006 for the design rationale.
 *
 * `agent.resumeFromCheckpoint` / `agent.listCheckpoints` integrate with
 * concrete adapters as of `@ziro-agent/agent` v0.2; resumable *streams*
 * (`streamText` + `resumeKey`) remain future work per RFC 0006.
 */
export interface Checkpointer {
  /**
   * Persist `snapshot` under `threadId` and return its newly assigned id.
   * The id is opaque; callers should pass it back through `get` /
   * `delete` rather than parsing it.
   */
  put(threadId: string, snapshot: AgentSnapshot): Promise<CheckpointId>;

  /**
   * Read a checkpoint. With no `checkpointId`, returns the most recent
   * one for `threadId`. Returns `null` for unknown thread or unknown id
   * — the caller should treat that as "nothing to resume from".
   */
  get(threadId: string, checkpointId?: CheckpointId): Promise<AgentSnapshot | null>;

  /**
   * List checkpoints for a thread, newest first. `limit` caps the
   * result; adapters MAY enforce a lower hard ceiling for memory
   * pressure reasons.
   */
  list(threadId: string, opts?: { limit?: number }): Promise<CheckpointMeta[]>;

  /**
   * Delete checkpoints. Without `checkpointId`, removes every
   * checkpoint for the thread (use this on conversation deletion).
   * No-ops silently when nothing matches.
   */
  delete(threadId: string, checkpointId?: CheckpointId): Promise<void>;
}
