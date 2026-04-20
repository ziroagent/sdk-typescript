# RFC 0009: MCP server (`ziroagent mcp serve`)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design TBD before v0.3 milestone start)
- Affected packages: `@ziro-agent/mcp-server` (new), `@ziro-agent/cli`, `@ziro-agent/tools`
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.3) and §A row H2

## Summary

Ship a first-class MCP **server** so any `defineTool` (and optionally any
`Agent`) can be exposed over the Model Context Protocol and consumed by Claude
Desktop, Cursor, ChatGPT, or any other MCP-aware host. Today we only ship an
MCP **client** (`packages/tools/src/mcp/adapter.ts`), which means Ziro tools
cannot be installed in the dominant 2026 distribution channel for agent tools.

## Scope

- New package `@ziro-agent/mcp-server` exposing `createMcpServer({ tools, agents })`.
- `ziroagent mcp serve [path]` CLI subcommand running the server over `stdio`
  and `streamable-http` transports.
- Tool capability surface: `tools/list`, `tools/call`, optional `resources/list`,
  `prompts/list`.
- Agent surface (optional, behind a flag): expose `Agent` as `tools/call` with
  `run`/`resume` semantics so MCP hosts can drive agent loops.
- OTel spans for every MCP request, nested under existing tool / agent spans.
- Authentication: bearer-token + signed-header strategies, opt-in.

## Non-goals

- Long-running daemon / process supervisor (use `pm2` / `systemd` / Docker).
- MCP gateway features (rate limiting, multi-tenant routing) — that's a
  product, not the SDK.
- A web UI to browse exposed tools (use Claude Desktop / Cursor as the UI).

## Open questions (defer to detailed design)

- Reuse `@modelcontextprotocol/sdk` server, or hand-roll? (Reuse preferred.)
- Where does `requiresApproval` map in the MCP protocol? (Likely client-side
  approval prompt — needs MCP spec read.)
- How do we expose `Agent.handoffs` to MCP hosts that don't model multi-agent
  loops? (Probably as opaque tool calls.)

## Detailed design

TBD before v0.3 milestone start. Owner to draft.
