import type { SandboxAdapter, SandboxExecuteResult, SandboxLanguage } from './types.js';

export interface StubSandboxAdapterOptions {
  /** Prepended to stdout so tests can assert the stub ran. */
  prefix?: string;
}

/**
 * No-op sandbox for dry-runs, docs, and unit tests. Does **not** execute code.
 */
export function createStubSandboxAdapter(options: StubSandboxAdapterOptions = {}): SandboxAdapter {
  const prefix = options.prefix ?? '[stub-sandbox] ';
  return {
    kind: 'stub',
    async execute(code: string, language: SandboxLanguage): Promise<SandboxExecuteResult> {
      return {
        stdout: `${prefix}skipped execution (${language}, ${code.length} chars)`,
        stderr: '',
        exitCode: 0,
        files: [],
      };
    },
  };
}
