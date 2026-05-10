# mcp-server — Claude Desktop (RFC 0009)

Expose Ziro **tools** over MCP stdio so clients like **Claude Desktop** can call them.

## Prerequisite

Build the CLI once (or use a published `ziroagent` from npm):

```bash
pnpm --filter @ziro-agent/cli build
```

## Run locally

From this directory:

```bash
pnpm install
pnpm mcp
```

That runs `ziroagent mcp serve ./tools.mjs`, which loads `tools.mjs` and speaks MCP over **stdio**.

## Claude Desktop

Add a server entry (path adjusted to your checkout):

```json
{
  "mcpServers": {
    "ziro-example": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/sdk-typescript/examples/mcp-server", "mcp"],
      "env": {}
    }
  }
}
```

If `ziroagent` is on your `PATH` from a global or project install, you can use `"command": "ziroagent"` and `"args": ["mcp", "serve", "/absolute/path/.../tools.mjs"]` instead.

## Customize

Edit `tools.mjs`: export `tools` as `Record<string, Tool>` from `defineTool()` (see `@ziro-agent/tools`).
