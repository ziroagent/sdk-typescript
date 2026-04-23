import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deleteFileBackedWorkingMemoryFiles,
  FileBackedWorkingMemory,
  resolveFileBackedWorkingMemoryPath,
} from './file-backed-working-memory.js';

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

  it('resolveFileBackedWorkingMemoryPath matches instance file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-wm-'));
    const key = 't-42';
    const wm = new FileBackedWorkingMemory('thread', key, dir);
    await wm.write('x');
    const resolved = resolveFileBackedWorkingMemoryPath(dir, 'thread', key);
    expect(await readFile(resolved, 'utf8')).toContain('x');
  });

  it('deleteFileBackedWorkingMemoryFiles removes selected keys only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-wm-'));
    await new FileBackedWorkingMemory('thread', 'a', dir).write('A');
    await new FileBackedWorkingMemory('thread', 'b', dir).write('B');
    await deleteFileBackedWorkingMemoryFiles(dir, 'thread', ['a']);
    expect(await new FileBackedWorkingMemory('thread', 'a', dir).read()).toBe('');
    expect(await new FileBackedWorkingMemory('thread', 'b', dir).read()).toContain('B');
  });
});
