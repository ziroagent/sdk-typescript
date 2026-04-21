import { describe, expect, it, vi } from 'vitest';
import { createDaytonaSandboxAdapter } from './daytona-sandbox-adapter.js';

describe('createDaytonaSandboxAdapter', () => {
  it('uses process.codeRun for python', async () => {
    const codeRun = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, result: 'hi', artifacts: { stdout: 'hi' } });
    const executeCommand = vi.fn();
    const adapter = createDaytonaSandboxAdapter({
      sandbox: { process: { codeRun, executeCommand } } as never,
    });
    const out = await adapter.execute('print(1)', 'python', { timeoutMs: 5000 });
    expect(codeRun).toHaveBeenCalledWith('print(1)', undefined, 5);
    expect(executeCommand).not.toHaveBeenCalled();
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe('hi');
  });

  it('uses bash+node for javascript', async () => {
    const codeRun = vi.fn();
    const executeCommand = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, result: 'out', artifacts: { stdout: 'out' } });
    const adapter = createDaytonaSandboxAdapter({
      sandbox: { process: { codeRun, executeCommand } } as never,
    });
    await adapter.execute('console.log(1)', 'javascript');
    expect(codeRun).not.toHaveBeenCalled();
    expect(executeCommand).toHaveBeenCalled();
    const arg0 = executeCommand.mock.calls[0]?.[0] as string;
    expect(arg0).toContain('node -e');
    expect(arg0.startsWith('bash -lc')).toBe(true);
  });
});
