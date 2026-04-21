import type { SandboxAdapter } from '@ziro-agent/core';
import { z } from 'zod';
import { defineTool } from '../define-tool.js';

const codeInterpreterInput = z.object({
  code: z.string().min(1),
  language: z.enum(['python', 'javascript', 'typescript']),
});

export type CodeInterpreterInput = z.infer<typeof codeInterpreterInput>;

export interface CreateCodeInterpreterToolOptions {
  sandbox: SandboxAdapter;
  /** Default: `code_interpreter` */
  name?: string;
  description?: string;
}

/**
 * Runs untrusted code inside a {@link SandboxAdapter} (E2B, Modal, or a stub).
 * Sets `mutates: true` so HITL defaults to approval per RFC 0013.
 */
export function createCodeInterpreterTool(options: CreateCodeInterpreterToolOptions) {
  const { sandbox, name = 'code_interpreter', description } = options;
  return defineTool({
    name,
    description:
      description ??
      'Execute Python or JavaScript/TypeScript in an isolated sandbox. State changes are confined to the sandbox environment.',
    input: codeInterpreterInput,
    mutates: true,
    async execute(input, ctx) {
      return sandbox.execute(input.code, input.language, { signal: ctx.abortSignal });
    },
  });
}
