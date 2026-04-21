---
"@ziro-agent/sandbox-daytona": minor
"@ziro-agent/sandbox-modal": minor
"@ziro-agent/browser-browserbase": minor
---

**RFC 0013 — more sandbox & browser reference packages**

- **`@ziro-agent/sandbox-daytona`** — `createDaytonaSandboxAdapter({ sandbox })` for Daytona `Sandbox.process` (`codeRun` / `node` fallback).
- **`@ziro-agent/sandbox-modal`** — `createModalSandboxAdapter({ sandbox })` for Modal `Sandbox.exec` (Node 22+ per Modal JS SDK).
- **`@ziro-agent/browser-browserbase`** — `connectBrowserbasePlaywrightPage()` to attach Playwright over CDP.
- Cookbook example **`examples/browse-intent`** documents `browse(url, intent)` via a thin agent + stub browser.
