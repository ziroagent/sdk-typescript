import type { Sandbox } from '@daytonaio/sdk';
import type {
  SandboxAdapter,
  SandboxExecuteOptions,
  SandboxExecuteResult,
  SandboxLanguage,
} from '@ziro-agent/core';

export interface CreateDaytonaSandboxAdapterOptions {
  /** Connected Daytona sandbox from `daytona.create()` / `daytona.get()`. */
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

/** Daytona `ExecuteResponse`-shaped result from `process.codeRun` / `executeCommand`. */
type DaytonaExecResult = {
  exitCode: number;
  result: string;
  artifacts?: { stdout: string };
};

function daytonaResultToSandbox(r: DaytonaExecResult): SandboxExecuteResult {
  const stdout = r.result !== '' ? r.result : (r.artifacts?.stdout ?? '');
  return {
    stdout,
    stderr: '',
    exitCode: r.exitCode,
    files: [],
  };
}

function timeoutSeconds(execOptions?: SandboxExecuteOptions): number | undefined {
  if (execOptions?.timeoutMs === undefined) return undefined;
  return Math.max(1, Math.ceil(execOptions.timeoutMs / 1000));
}

/** Shell-safe single-quoted string for `bash -lc`. */
function shellSingleQuoted(code: string): string {
  return `'${code.replace(/'/g, `'\\''`)}'`;
}

/**
 * Wraps a Daytona {@link Sandbox} as a {@link SandboxAdapter}.
 *
 * - **`python`** uses `sandbox.process.codeRun` (matches Daytona’s interpreter path).
 * - **`javascript`** / **`typescript`** run via `bash -lc 'node -e …'` — keep snippets
 *   short; for heavy TS prefer a TypeScript-labelled sandbox and `codeRun` only.
 */
export function createDaytonaSandboxAdapter(
  options: CreateDaytonaSandboxAdapterOptions,
): SandboxAdapter {
  const { sandbox } = options;
  return {
    kind: 'daytona',
    async execute(
      code: string,
      language: SandboxLanguage,
      execOptions?: SandboxExecuteOptions,
    ): Promise<SandboxExecuteResult> {
      const timeoutSec = timeoutSeconds(execOptions);
      if (language === 'python') {
        const r = await runWithOptionalAbort(
          () => sandbox.process.codeRun(code, undefined, timeoutSec),
          execOptions?.signal,
        );
        return daytonaResultToSandbox(r);
      }
      const inner = shellSingleQuoted(code);
      const cmd = `node -e ${inner}`;
      const r = await runWithOptionalAbort(
        () =>
          sandbox.process.executeCommand(
            `bash -lc ${shellSingleQuoted(cmd)}`,
            undefined,
            undefined,
            timeoutSec,
          ),
        execOptions?.signal,
      );
      return daytonaResultToSandbox(r);
    },
  };
}
