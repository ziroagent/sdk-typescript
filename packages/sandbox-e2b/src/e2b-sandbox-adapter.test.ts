import { describe, expect, it, vi } from 'vitest';
import { createE2bSandboxAdapter } from './e2b-sandbox-adapter.js';

describe('createE2bSandboxAdapter', () => {
  it('maps stdout/stderr/exitCode from a successful Execution', async () => {
    const runCode = vi.fn().mockResolvedValue({
      logs: { stdout: ['a', 'b'], stderr: ['warn'] },
      get text() {
        return 'result';
      },
      error: undefined,
    });
    const adapter = createE2bSandboxAdapter({
      sandbox: { runCode } as never,
    });
    const out = await adapter.execute('1+1', 'python');
    expect(runCode).toHaveBeenCalledWith('1+1', { language: 'python', timeoutMs: undefined });
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe('a\nb\nresult');
    expect(out.stderr).toBe('warn');
    expect(out.files).toEqual([]);
  });

  it('maps ExecutionError into stderr and exitCode 1', async () => {
    const runCode = vi.fn().mockResolvedValue({
      logs: { stdout: [], stderr: [] },
      text: undefined,
      error: { name: 'ValueError', value: 'bad', traceback: 'Traceback...' },
    });
    const adapter = createE2bSandboxAdapter({
      sandbox: { runCode } as never,
    });
    const out = await adapter.execute('raise', 'python');
    expect(out.exitCode).toBe(1);
    expect(out.stderr).toContain('ValueError: bad');
    expect(out.stderr).toContain('Traceback...');
  });

  it('forwards timeoutMs and uses javascript language', async () => {
    const runCode = vi.fn().mockResolvedValue({
      logs: { stdout: [], stderr: [] },
      text: undefined,
      error: undefined,
    });
    const adapter = createE2bSandboxAdapter({
      sandbox: { runCode } as never,
    });
    await adapter.execute('console.log(1)', 'javascript', { timeoutMs: 12_000 });
    expect(runCode).toHaveBeenCalledWith('console.log(1)', {
      language: 'javascript',
      timeoutMs: 12_000,
    });
  });

  it('rejects with AbortError when already aborted', async () => {
    const runCode = vi.fn();
    const adapter = createE2bSandboxAdapter({
      sandbox: { runCode } as never,
    });
    const ac = new AbortController();
    ac.abort();
    await expect(adapter.execute('x', 'python', { signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(runCode).not.toHaveBeenCalled();
  });
});
