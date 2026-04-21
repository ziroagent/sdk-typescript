import type {
  SandboxAdapter,
  SandboxExecuteOptions,
  SandboxExecuteResult,
  SandboxLanguage,
} from '@ziro-agent/core';
import type { Sandbox } from 'modal';

export interface CreateModalSandboxAdapterOptions {
  /** Active Modal {@link Sandbox} from `modal.sandboxes.create(...)`. */
  sandbox: Sandbox;
}

async function runWithOptionalAbort<T>(start: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return start();
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    start().then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

function argvForLanguage(language: SandboxLanguage, code: string): string[] {
  switch (language) {
    case 'python':
      return ['python', '-c', code];
    case 'javascript':
    case 'typescript':
      return ['node', '-e', code];
    default:
      return ['python', '-c', code];
  }
}

/**
 * Wraps a Modal {@link Sandbox} as a {@link SandboxAdapter} for
 * `createCodeInterpreterTool({ sandbox })` in `@ziro-agent/tools`.
 *
 * Requires the Modal JS SDK (`modal` on npm) — see [Modal Sandboxes](https://modal.com/docs/guide/sandbox).
 * The upstream SDK targets **Node.js 22+**.
 */
export function createModalSandboxAdapter(
  options: CreateModalSandboxAdapterOptions,
): SandboxAdapter {
  const { sandbox } = options;
  return {
    kind: 'modal',
    async execute(
      code: string,
      language: SandboxLanguage,
      execOptions?: SandboxExecuteOptions,
    ): Promise<SandboxExecuteResult> {
      return runWithOptionalAbort(async () => {
        const proc = await sandbox.exec(argvForLanguage(language, code), {
          timeoutMs: execOptions?.timeoutMs,
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const [stdout, stderr] = await Promise.all([
          proc.stdout.readText(),
          proc.stderr.readText(),
        ]);
        const exitCode = await proc.wait();
        return {
          stdout,
          stderr,
          exitCode,
          files: [],
        };
      }, execOptions?.signal);
    },
  };
}
