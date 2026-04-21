---
"@ziro-agent/tools": minor
"@ziro-agent/tracing": patch
---

**Tool trace metadata (RFC 0013 observability)**

- **@ziro-agent/tools** — `Tool` / `defineTool` accept optional `capabilities`, `spanName`, and `traceAttributes`; sandbox/browser factories set `ziro.sandbox.execute` / `ziro.browser.action` and default capability tags; export `CODE_INTERPRETER_CAPABILITIES`.
- **@ziro-agent/tracing** — `ATTR.ToolCapabilities`, `ATTR.BrowserOperation`; `instrumentTool` emits custom span names and merges capability / trace attributes.
