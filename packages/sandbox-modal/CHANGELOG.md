# @ziro-agent/sandbox-modal

## 0.2.6

### Patch Changes

- Updated dependencies [[`fb04cd2`](https://github.com/ziroagent/sdk-typescript/commit/fb04cd200af279907da0ee7e915b67ee485892d0)]:
  - @ziro-agent/core@0.9.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`10b88b0`](https://github.com/ziroagent/sdk-typescript/commit/10b88b010b8c722954b1cead51c47f27adcbae24), [`59ca15d`](https://github.com/ziroagent/sdk-typescript/commit/59ca15d600266292aaacf59eb03bd5c00feb8c90), [`9924a20`](https://github.com/ziroagent/sdk-typescript/commit/9924a2077353e385ded93e3a28ac5ddad32a9da8)]:
  - @ziro-agent/core@0.8.1

## 0.2.4

### Patch Changes

- Updated dependencies [[`1354315`](https://github.com/ziroagent/sdk-typescript/commit/1354315b2d2de6f13744a962039541301a1ffef6)]:
  - @ziro-agent/core@0.8.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4), [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4), [`ab6ab69`](https://github.com/ziroagent/sdk-typescript/commit/ab6ab693e1b1099b25e77fc36517c9f916a46de4)]:
  - @ziro-agent/core@0.7.3

## 0.2.2

### Patch Changes

- Updated dependencies [[`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e)]:
  - @ziro-agent/core@0.7.2

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
