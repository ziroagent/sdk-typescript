import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runZiroToolsMcpStdio } from '@ziro-agent/mcp-server';
import type { Tool } from '@ziro-agent/tools';
import { isTool } from '@ziro-agent/tools';
import type { Logger } from '../util/logger.js';

export interface McpServeOptions {
  entry: string;
  cwd: string;
  logger: Logger;
}

function isToolRecord(value: unknown): value is Record<string, Tool> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value).every((v) => isTool(v));
}

/**
 * `ziroagent mcp serve <file.mjs>` — dynamic-import an ESM module that exports
 * `{ tools: Record<string, Tool> }` or `default` of the same shape, then run
 * MCP stdio (RFC 0009).
 */
export async function runMcpServe(options: McpServeOptions): Promise<number> {
  const { entry, cwd, logger } = options;
  if (!entry.endsWith('.mjs') && !entry.endsWith('.js')) {
    logger.error(
      'mcp serve currently requires a compiled .js or .mjs entry (TypeScript: build first or use tsx manually).',
    );
    return 2;
  }
  const abs = resolve(cwd, entry);
  const mod = (await import(pathToFileURL(abs).href)) as {
    default?: unknown;
    tools?: unknown;
  };
  const raw = mod.tools ?? mod.default;
  const tools =
    raw && typeof raw === 'object' && 'tools' in (raw as object)
      ? (raw as { tools: unknown }).tools
      : raw;
  if (!isToolRecord(tools)) {
    logger.error(
      'Module must export `tools` as Record<string, Tool> (or default { tools }) from defineTool().',
    );
    return 2;
  }
  await runZiroToolsMcpStdio(tools);
  return 0;
}
