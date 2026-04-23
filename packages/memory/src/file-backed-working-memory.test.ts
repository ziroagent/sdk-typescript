import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileBackedWorkingMemory } from './file-backed-working-memory.js';

describe('FileBackedWorkingMemory', () => {
  it('write read append clear', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-wm-'));
    const wm = new FileBackedWorkingMemory('thread', 'my/thread:id', dir);
    expect(await wm.read()).toBe('');
    await wm.write('# A\n');
    expect(await wm.read()).toContain('# A');
    await wm.append('line2');
    expect(await wm.read()).toMatch(/# A\nline2$/);
    await wm.clear();
    expect(await wm.read()).toBe('');
  });

  it('isolates different keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-wm-'));
    const a = new FileBackedWorkingMemory('resource', 'u1', dir);
    const b = new FileBackedWorkingMemory('resource', 'u2', dir);
    await a.write('alpha');
    await b.write('beta');
    expect(await a.read()).toBe('alpha');
    expect(await b.read()).toBe('beta');
  });
});
