import type { AgentSnapshot, Checkpointer, CheckpointId, CheckpointMeta } from '@ziro-agent/agent';
import { uuidv7 } from './uuid7.js';

/**
 * Per-thread record we keep in memory. We hold the snapshot itself plus
 * the metadata so `list()` is a constant-time slice without a JSON
 * round-trip.
 */
interface Stored {
  id: CheckpointId;
  threadId: string;
  createdAt: Date;
  agentSnapshotVersion: number;
  /** Serialized payload — also used to compute `sizeBytes` cheaply. */
  payload: string;
  parsed: AgentSnapshot;
  sizeBytes: number;
}

export interface MemoryCheckpointerOptions {
  /**
   * Hard cap on retained checkpoints per `threadId`. When exceeded the
   * oldest checkpoint is evicted (FIFO). Default `100`.
   *
   * Set to a finite number to bound memory in long-running tests; pass
   * `Infinity` to disable. Adapters in production deployments
   * (`@ziro-agent/checkpoint-postgres`, `@ziro-agent/checkpoint-redis`)
   * implement the same cap on the storage side.
   */
  maxCheckpointsPerThread?: number;
  /**
   * Override for tests / determinism. Defaults to `Date.now`.
   */
  now?: () => number;
}

/**
 * Reference {@link Checkpointer} backed by a `Map<string, Stored[]>` —
 * fast, dependency-free, and process-local. Perfect for:
 *
 * - vitest / jest unit tests around HITL resume
 * - `examples/` showing snapshot persistence without a database
 * - single-process deployments where durability across crashes is not
 *   required
 *
 * **Not** appropriate for production multi-process deployments — use
 * `@ziro-agent/checkpoint-postgres` or `@ziro-agent/checkpoint-redis`
 * (RFC 0006 §adapters; both ship in v0.2).
 *
 * Snapshots are deep-cloned via `structuredClone` on both `put` and
 * `get` so callers cannot mutate the persisted object out of band.
 */
export class MemoryCheckpointer implements Checkpointer {
  private readonly threads = new Map<string, Stored[]>();
  private readonly cap: number;
  private readonly now: () => number;

  constructor(opts: MemoryCheckpointerOptions = {}) {
    this.cap = opts.maxCheckpointsPerThread ?? 100;
    this.now = opts.now ?? Date.now;
  }

  async put(threadId: string, snapshot: AgentSnapshot): Promise<CheckpointId> {
    const id = uuidv7(this.now());
    const payload = JSON.stringify(snapshot);
    const stored: Stored = {
      id,
      threadId,
      createdAt: new Date(this.now()),
      agentSnapshotVersion: snapshot.version,
      payload,
      parsed: structuredClone(snapshot),
      sizeBytes: byteLength(payload),
    };
    const list = this.threads.get(threadId) ?? [];
    // Newest first — matches `list()` contract and makes `get(threadId)`
    // O(1) without a sort.
    list.unshift(stored);
    if (Number.isFinite(this.cap) && list.length > this.cap) {
      list.length = this.cap;
    }
    this.threads.set(threadId, list);
    return id;
  }

  async get(threadId: string, checkpointId?: CheckpointId): Promise<AgentSnapshot | null> {
    const list = this.threads.get(threadId);
    if (!list || list.length === 0) return null;
    const target = checkpointId ? list.find((s) => s.id === checkpointId) : list[0];
    if (!target) return null;
    return structuredClone(target.parsed);
  }

  async list(threadId: string, opts?: { limit?: number }): Promise<CheckpointMeta[]> {
    const list = this.threads.get(threadId);
    if (!list || list.length === 0) return [];
    const limit = opts?.limit ?? list.length;
    return list.slice(0, Math.max(0, limit)).map(toMeta);
  }

  async delete(threadId: string, checkpointId?: CheckpointId): Promise<void> {
    if (!checkpointId) {
      this.threads.delete(threadId);
      return;
    }
    const list = this.threads.get(threadId);
    if (!list) return;
    const next = list.filter((s) => s.id !== checkpointId);
    if (next.length === 0) {
      this.threads.delete(threadId);
    } else {
      this.threads.set(threadId, next);
    }
  }

  /** Test-only helper — number of threads currently retained. */
  get threadCount(): number {
    return this.threads.size;
  }
}

function toMeta(s: Stored): CheckpointMeta {
  return {
    id: s.id,
    threadId: s.threadId,
    createdAt: s.createdAt,
    agentSnapshotVersion: s.agentSnapshotVersion,
    sizeBytes: s.sizeBytes,
  };
}

/**
 * UTF-8 byte length without pulling `Buffer` (so this works in
 * non-Node runtimes — workerd, browser, Deno).
 */
function byteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
