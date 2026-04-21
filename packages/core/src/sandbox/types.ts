/**
 * Kernel-isolated code execution — see RFC 0013. Adapters (E2B, Modal, …)
 * implement this contract; the SDK never runs untrusted code in-process.
 */
export type SandboxLanguage = 'python' | 'javascript' | 'typescript';

/** File emitted by the sandbox (paths are adapter-defined, often under /tmp). */
export interface SandboxFileArtifact {
  path: string;
  /** Base64 payload unless the adapter documents otherwise. */
  data: string;
  mimeType?: string;
}

export interface SandboxExecuteOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Forward-compat capability tags, e.g. `fs:write:/tmp` — RFC 0013. */
  capabilities?: readonly string[];
}

export interface SandboxExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  files?: SandboxFileArtifact[];
}

export interface SandboxAdapter {
  /** Adapter id for logs / traces (e.g. `e2b`, `stub`). */
  readonly kind?: string;
  execute(
    code: string,
    language: SandboxLanguage,
    options?: SandboxExecuteOptions,
  ): Promise<SandboxExecuteResult>;
}

export interface BrowserNavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  signal?: AbortSignal;
}

/**
 * Low-level browser automation — RFC 0013. Implementations may wrap Playwright,
 * Browserbase, etc. Optional methods throw at runtime if invoked when absent.
 */
export interface BrowserAdapter {
  readonly kind?: string;
  goto(url: string, options?: BrowserNavigateOptions): Promise<void>;
  click?(selector: string, options?: { signal?: AbortSignal }): Promise<void>;
  type?(selector: string, text: string, options?: { signal?: AbortSignal }): Promise<void>;
  screenshot?(options?: { signal?: AbortSignal }): Promise<Uint8Array>;
  evaluate?<T>(snippet: string): Promise<T>;
  close?(): Promise<void>;
}
