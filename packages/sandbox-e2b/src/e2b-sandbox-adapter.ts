import type { Sandbox as E2bCodeInterpreterSandbox, Execution } from '@e2b/code-interpreter';
import type {
  SandboxAdapter,
  SandboxExecuteOptions,
  SandboxExecuteResult,
  SandboxLanguage,
} from '@ziro-agent/core';

export interface CreateE2bSandboxAdapterOptions {
  /** Active E2B code-interpreter sandbox from `Sandbox.create()`. */
  sandbox: E2bCodeInterpreterSandbox;
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

function executionToResult(exec: Execution): SandboxExecuteResult {
  const stdoutLines = [...exec.logs.stdout];
  const stderrLines = [...exec.logs.stderr];
  const text = exec.text;
  if (text !== undefined && text !== '') stdoutLines.push(text);
  if (exec.error !== undefined) {
    stderrLines.push(`${exec.error.name}: ${exec.error.value}`, exec.error.traceback);
  }
  return {
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n'),
    exitCode: exec.error !== undefined ? 1 : 0,
    files: [],
  };
}

function e2bRunLanguage(language: SandboxLanguage): 'python' | 'javascript' | 'typescript' {
  return language;
}

/**
 * Wraps an E2B {@link E2bCodeInterpreterSandbox} as a {@link SandboxAdapter} for
 * `createCodeInterpreterTool({ sandbox })` in `@ziro-agent/tools`.
 */
export function createE2bSandboxAdapter(options: CreateE2bSandboxAdapterOptions): SandboxAdapter {
  const { sandbox } = options;
  return {
    kind: 'e2b',
    async execute(
      code: string,
      language: SandboxLanguage,
      execOptions?: SandboxExecuteOptions,
    ): Promise<SandboxExecuteResult> {
      const exec = await runWithOptionalAbort(
        () =>
          sandbox.runCode(code, {
            language: e2bRunLanguage(language),
            timeoutMs: execOptions?.timeoutMs,
          }),
        execOptions?.signal,
      );
      return executionToResult(exec);
    },
  };
}
