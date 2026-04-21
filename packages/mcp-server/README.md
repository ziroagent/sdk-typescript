# @ziro-agent/mcp-server

Expose a `Record<string, Tool>` from `@ziro-agent/tools` over **MCP stdio** so Claude Desktop, Cursor, and other MCP hosts can call your tools.

```ts
import { runZiroToolsMcpStdio } from '@ziro-agent/mcp-server';
import { defineTool } from '@ziro-agent/tools';
import { z } from 'zod';

const add = defineTool({
  name: 'add',
  input: z.object({ a: z.number(), b: z.number() }),
  execute: async ({ a, b }) => a + b,
});

await runZiroToolsMcpStdio({ add });
```

Use `ziroagent mcp serve ./path/to/tools.mjs` to load an ESM module that `export default { tools: { ... } }`.

See [RFC 0009](../../rfcs/0009-mcp-server.md).
