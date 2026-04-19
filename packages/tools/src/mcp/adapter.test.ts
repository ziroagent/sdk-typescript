import { describe, expect, it } from 'vitest';
import { mcpToolsFromClient, type McpClientLike } from './adapter.js';

const fakeClient = (): McpClientLike => {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  return {
    async listTools() {
      return {
        tools: [
          {
            name: 'echo',
            description: 'echo input',
            inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
          },
          { name: 'fail', description: 'always fails' },
        ],
      };
    },
    async callTool({ name, arguments: args }) {
      calls.push({ name, ...(args ? { args } : {}) });
      if (name === 'fail') {
        return { isError: true, content: [{ type: 'text', text: 'nope' }] };
      }
      return { content: [{ type: 'text', text: `echo:${(args as { msg?: string })?.msg}` }] };
    },
  };
};

describe('mcpToolsFromClient', () => {
  it('exposes MCP tools as Ziro tools', async () => {
    const tools = await mcpToolsFromClient({ client: fakeClient() });
    expect(Object.keys(tools).sort()).toEqual(['echo', 'fail']);

    const out = await tools['echo']?.execute({ msg: 'hi' }, { toolCallId: 't1' });
    expect(out).toBe('echo:hi');
  });

  it('respects namespace and filter', async () => {
    const tools = await mcpToolsFromClient({
      client: fakeClient(),
      namespace: 'svc',
      filter: (n) => n === 'echo',
    });
    expect(Object.keys(tools)).toEqual(['svc_echo']);
  });

  it('throws when MCP returns an error', async () => {
    const tools = await mcpToolsFromClient({ client: fakeClient() });
    await expect(tools['fail']?.execute({}, { toolCallId: 't' })).rejects.toThrow('nope');
  });
});
