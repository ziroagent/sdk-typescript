# @ziro-agent/browser-browserbase

## 0.2.0

### Minor Changes

- [#40](https://github.com/ziroagent/sdk-typescript/pull/40) [`f67d2a2`](https://github.com/ziroagent/sdk-typescript/commit/f67d2a2558e2eb8910893e3b80ea512c4c314f91) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **RFC 0013 — more sandbox & browser reference packages**

  - **`@ziro-agent/sandbox-daytona`** — `createDaytonaSandboxAdapter({ sandbox })` for Daytona `Sandbox.process` (`codeRun` / `node` fallback).
  - **`@ziro-agent/sandbox-modal`** — `createModalSandboxAdapter({ sandbox })` for Modal `Sandbox.exec` (Node 22+ per Modal JS SDK).
  - **`@ziro-agent/browser-browserbase`** — `connectBrowserbasePlaywrightPage()` to attach Playwright over CDP.
  - Cookbook example **`examples/browse-intent`** documents `browse(url, intent)` via a thin agent + stub browser.
