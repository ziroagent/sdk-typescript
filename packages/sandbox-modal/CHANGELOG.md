# @ziro-agent/sandbox-modal

## 0.2.1

### Patch Changes

- Updated dependencies [[`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14)]:
  - @ziro-agent/core@0.7.1

## 0.2.0

### Minor Changes

- [#40](https://github.com/ziroagent/sdk-typescript/pull/40) [`f67d2a2`](https://github.com/ziroagent/sdk-typescript/commit/f67d2a2558e2eb8910893e3b80ea512c4c314f91) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **RFC 0013 — more sandbox & browser reference packages**

  - **`@ziro-agent/sandbox-daytona`** — `createDaytonaSandboxAdapter({ sandbox })` for Daytona `Sandbox.process` (`codeRun` / `node` fallback).
  - **`@ziro-agent/sandbox-modal`** — `createModalSandboxAdapter({ sandbox })` for Modal `Sandbox.exec` (Node 22+ per Modal JS SDK).
  - **`@ziro-agent/browser-browserbase`** — `connectBrowserbasePlaywrightPage()` to attach Playwright over CDP.
  - Cookbook example **`examples/browse-intent`** documents `browse(url, intent)` via a thin agent + stub browser.

### Patch Changes

- Updated dependencies [[`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7), [`683efc4`](https://github.com/ziroagent/sdk-typescript/commit/683efc4051d4713487a71da2be0d2ea4a40f6bb5), [`e726cda`](https://github.com/ziroagent/sdk-typescript/commit/e726cdaa6684b02409a64d63bf59ca4a6e63c127)]:
  - @ziro-agent/core@0.7.0
