---
"@ziro-agent/core": minor
"@ziro-agent/tools": minor
---

**v0.7 H4/H5 sandbox & browser slice (interfaces + tool factories)**

- **@ziro-agent/core** — `SandboxAdapter` / `BrowserAdapter` contracts, execute/result types, `createStubSandboxAdapter()`, `createStubBrowserAdapter()` for tests.
- **@ziro-agent/tools** — `createCodeInterpreterTool({ sandbox })`; `createBrowserGotoTool` / `createBrowserScreenshotTool({ browser })` (both `mutates: true`).

Reference adapters `@ziro-agent/sandbox-e2b` / `@ziro-agent/browser-playwright` remain future work per RFC 0013.
