import { describe, expect, it } from 'vitest';
import { InMemoryWorkingMemory } from './working-memory.js';

describe('InMemoryWorkingMemory', () => {
  it('append and clear', async () => {
    const m = new InMemoryWorkingMemory('thread', 't1');
    await m.append('# Notes\n');
    await m.append('- item');
    expect(await m.read()).toContain('item');
    await m.clear();
    expect(await m.read()).toBe('');
  });
});
