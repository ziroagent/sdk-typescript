---
"@ziro-agent/sandbox-e2b": minor
"@ziro-agent/browser-playwright": minor
---

**RFC 0013 reference adapters**

- **`@ziro-agent/sandbox-e2b`** — `createE2bSandboxAdapter({ sandbox })` maps `@e2b/code-interpreter` `Sandbox` to `SandboxAdapter` (stdout/stderr/exitCode, optional `AbortSignal` before start).
- **`@ziro-agent/browser-playwright`** — `createPlaywrightBrowserAdapter(page)` maps Playwright `Page` to `BrowserAdapter` (`goto`, `click`, `fill` via `type`, PNG `screenshot`, `evaluate`, `close`; `AbortSignal` raced around primitives).
