import { describe, expect, it, vi } from 'vitest';
import { createModalSandboxAdapter } from './modal-sandbox-adapter.js';

describe('createModalSandboxAdapter', () => {
  it('runs python via sandbox.exec', async () => {
    const exec = vi.fn().mockResolvedValue({
      stdout: { readText: vi.fn().mockResolvedValue('ok\n') },
      stderr: { readText: vi.fn().mockResolvedValue('') },
      wait: vi.fn().mockResolvedValue(0),
    });
    const adapter = createModalSandboxAdapter({ sandbox: { exec } as never });
    const out = await adapter.execute('print(1)', 'python', { timeoutMs: 9000 });
    expect(exec).toHaveBeenCalledWith(['python', '-c', 'print(1)'], {
      timeoutMs: 9000,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(out.stdout).toBe('ok\n');
    expect(out.exitCode).toBe(0);
  });

  it('runs javascript with node -e', async () => {
    const exec = vi.fn().mockResolvedValue({
      stdout: { readText: vi.fn().mockResolvedValue('') },
      stderr: { readText: vi.fn().mockResolvedValue('') },
      wait: vi.fn().mockResolvedValue(0),
    });
    const adapter = createModalSandboxAdapter({ sandbox: { exec } as never });
    await adapter.execute('1+1', 'javascript');
    expect(exec).toHaveBeenCalledWith(['node', '-e', '1+1'], {
      timeoutMs: undefined,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  });
});
