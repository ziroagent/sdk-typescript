import { z } from 'zod';
import { defineTool, type Tool } from '../define-tool.js';

/**
 * Minimal structural type matching the surface of `@modelcontextprotocol/sdk`'s
 * `Client` that we depend on. We avoid importing the SDK directly so it stays
 * an optional peer dependency — users who don't use MCP shouldn't be forced
 * to install it.
 */
export interface McpClientLike {
  listTools(): Promise<{
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>;
  }>;
  callTool(args: { name: string; arguments?: Record<string, unknown> }): Promise<{
    content: Array<{ type: string; text?: string; [k: string]: unknown }>;
    isError?: boolean;
  }>;
}

export interface McpToolAdapterOptions {
  client: McpClientLike;
  /** Optional prefix prepended to every tool name to avoid collisions. */
  namespace?: string;
  /** Filter which MCP tools are exposed (return true to keep). */
  filter?: (toolName: string) => boolean;
}

/**
 * Discover tools from an MCP client and expose them as Ziro `Tool`s.
 * Input schemas are imported as JSON Schema and wrapped with a `z.unknown()`
 * passthrough — MCP servers own validation, we just forward arguments.
 */
export async function mcpToolsFromClient(
  options: McpToolAdapterOptions,
): Promise<Record<string, Tool>> {
  const { client, namespace, filter } = options;
  const { tools } = await client.listTools();

  const out: Record<string, Tool> = {};
  for (const t of tools) {
    if (filter && !filter(t.name)) continue;
    const fullName = namespace ? `${namespace}_${t.name}` : t.name;

    const tool = defineTool({
      name: fullName,
      ...(t.description !== undefined ? { description: t.description } : {}),
      input: z.record(z.string(), z.unknown()),
      async execute(args) {
        const res = await client.callTool({
          name: t.name,
          arguments: args as Record<string, unknown>,
        });
        if (res.isError) {
          throw new Error(extractText(res.content) || `MCP tool ${t.name} failed.`);
        }
        return extractText(res.content) ?? res.content;
      },
    });

    out[fullName] = tool;
  }

  return out;
}

function extractText(
  content: Array<{ type: string; text?: string; [k: string]: unknown }>,
): string | undefined {
  const texts = content.filter((c) => c.type === 'text' && typeof c.text === 'string');
  if (texts.length === 0) return undefined;
  return texts.map((c) => c.text).join('\n');
}
