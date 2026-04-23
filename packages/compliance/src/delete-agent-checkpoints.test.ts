import { describe, expect, it, vi } from 'vitest';
import { deleteAgentCheckpointsForThreads } from './delete-agent-checkpoints.js';
import { deleteUserDataInOrder } from './delete-user-data.js';

describe('deleteAgentCheckpointsForThreads', () => {
  it('calls checkpointer.delete for each thread id', async () => {
    const del = vi.fn(async () => {});
    const cp = { delete: del };
    await deleteAgentCheckpointsForThreads(cp, ['a', 'b']);
    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenNthCalledWith(1, 'a');
    expect(del).toHaveBeenNthCalledWith(2, 'b');
  });

  it('wires into deleteUserDataInOrder', async () => {
    const del = vi.fn(async () => {});
    await deleteUserDataInOrder(
      { userId: 'u', threadIds: ['t1'] },
      {
        deleteAgentCheckpoints: (ids) => deleteAgentCheckpointsForThreads({ delete: del }, ids),
      },
    );
    expect(del).toHaveBeenCalledWith('t1');
  });
});
