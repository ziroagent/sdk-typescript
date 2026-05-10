/**
 * Minimal MCP tool map for `ziroagent mcp serve ./tools.mjs`.
 * Build CLI first: `pnpm --filter @ziro-agent/cli build` from repo root.
 */
import { defineTool } from '@ziro-agent/tools';
import { z } from 'zod';

export const tools = {
  greet: defineTool({
    name: 'greet',
    description: 'Return a short greeting for the given name.',
    input: z.object({ name: z.string() }),
    execute: async ({ name }) => ({ message: `Hello, ${name}!` }),
  }),
};
