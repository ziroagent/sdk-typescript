import type { AgentSnapshot } from '@ziro-agent/agent';
import { describe, expect, it } from 'vitest';
import { MemoryCheckpointer } from './memory-checkpointer.js';
import { uuidv7 } from './uuid7.js';

function fakeSnapshot(overrides: Partial<AgentSnapshot> = {}): AgentSnapshot {
  return {
    version: 2,
    __ziro_snapshot__: true,
    createdAt: new Date('2026-04-22T00:00:00Z').toISOString(),
    step: 1,
    messages: [],
    steps: [],
    totalUsage: {},
    pendingApprovals: [],
    resolvedSiblings: [],
    ...overrides,
  };
}

describe('MemoryCheckpointer', () => {
  it('round-trips put/get and returns latest by default', async () => {
    const cp = new MemoryCheckpointer();
    const a = await cp.put('thread-1', fakeSnapshot({ step: 1 }));
    const b = await cp.put('thread-1', fakeSnapshot({ step: 2 }));

    const latest = await cp.get('thread-1');
    expect(latest?.step).toBe(2);

    const earlier = await cp.get('thread-1', a);
    expect(earlier?.step).toBe(1);

    expect(a).not.toBe(b);
    // v7 ids are time-sortable: later id > earlier id lexicographically.
    expect(b > a).toBe(true);
  });

  it('returns null for unknown thread or unknown id', async () => {
    const cp = new MemoryCheckpointer();
    expect(await cp.get('missing')).toBeNull();
    await cp.put('thread-1', fakeSnapshot());
    expect(await cp.get('thread-1', 'definitely-not-an-id')).toBeNull();
  });

  it('list returns metadata newest-first and respects limit', async () => {
    const cp = new MemoryCheckpointer();
    await cp.put('thread-1', fakeSnapshot({ step: 1 }));
    await cp.put('thread-1', fakeSnapshot({ step: 2 }));
    await cp.put('thread-1', fakeSnapshot({ step: 3 }));

    const all = await cp.list('thread-1');
    expect(all).toHaveLength(3);
    expect(all[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(
      all[2]?.createdAt.getTime() as number,
    );

    const limited = await cp.list('thread-1', { limit: 2 });
    expect(limited).toHaveLength(2);

    expect(all[0]?.sizeBytes).toBeGreaterThan(0);
    expect(all[0]?.agentSnapshotVersion).toBe(2);
  });

  it('delete by id removes only that checkpoint; delete without id removes all', async () => {
    const cp = new MemoryCheckpointer();
    const a = await cp.put('thread-1', fakeSnapshot({ step: 1 }));
    await cp.put('thread-1', fakeSnapshot({ step: 2 }));

    await cp.delete('thread-1', a);
    const after = await cp.list('thread-1');
    expect(after).toHaveLength(1);
    expect(await cp.get('thread-1', a)).toBeNull();

    await cp.delete('thread-1');
    expect(await cp.list('thread-1')).toHaveLength(0);
    expect(cp.threadCount).toBe(0);
  });

  it('FIFO-evicts when maxCheckpointsPerThread is exceeded', async () => {
    const cp = new MemoryCheckpointer({ maxCheckpointsPerThread: 2 });
    await cp.put('t', fakeSnapshot({ step: 1 }));
    await cp.put('t', fakeSnapshot({ step: 2 }));
    await cp.put('t', fakeSnapshot({ step: 3 }));

    const meta = await cp.list('t');
    expect(meta).toHaveLength(2);
    const snapshots = await Promise.all(meta.map((m) => cp.get('t', m.id)));
    const steps = snapshots.map((s) => s?.step).sort();
    // step=1 was evicted; 2 and 3 survive.
    expect(steps).toEqual([2, 3]);
  });

  it('isolates writes — caller mutations after put do not affect persisted snapshot', async () => {
    const cp = new MemoryCheckpointer();
    const snap = fakeSnapshot({ step: 1 });
    const id = await cp.put('t', snap);
    snap.step = 999;

    const out = await cp.get('t', id);
    expect(out?.step).toBe(1);

    if (out) out.step = -1;
    const again = await cp.get('t', id);
    expect(again?.step).toBe(1);
  });

  it('uuidv7 produces lexicographically-sortable ids over time', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(b > a).toBe(true);
    // Standard UUID format: 8-4-4-4-12 hex with hyphens.
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
