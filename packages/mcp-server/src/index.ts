import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Tool } from '@ziro-agent/tools';

function encodeToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/**
 * Start an MCP server on **stdio** that exposes every Ziro {@link Tool} in
 * `tools` as an MCP tool (`tools/list` + `tools/call`).
 *
 * Intended for Claude Desktop / Cursor wiring (RFC 0009). The process stays
 * alive until stdin closes.
 */
export async function runZiroToolsMcpStdio(tools: Record<string, Tool>): Promise<void> {
  const mcp = new McpServer({ name: 'ziro-agent', version: '0.1.0' });

  for (const tool of Object.values(tools)) {
    mcp.registerTool(
      tool.name,
      {
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        inputSchema: tool.input,
      },
      async (args: unknown) => {
        const out = await tool.execute(args as never, {
          toolCallId: randomUUID(),
        });
        return {
          content: [{ type: 'text' as const, text: encodeToolResult(out) }],
        };
      },
    );
  }

  await mcp.connect(new StdioServerTransport());
}
