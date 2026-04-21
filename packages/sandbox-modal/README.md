# @ziro-agent/sandbox-modal

Maps a Modal [`Sandbox`](https://modal.com/docs/guide/sandbox) to ZiroAgent [`SandboxAdapter`](https://github.com/ziroagent/sdk-typescript) for `createCodeInterpreterTool()` from `@ziro-agent/tools`.

## Requirements

- **`modal`** npm package (Modal JavaScript SDK).
- **Node.js 22+** (per Modal’s JS SDK support matrix).

Authenticate with Modal (`modal setup` or `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`).

## Install

```bash
pnpm add @ziro-agent/sandbox-modal modal @ziro-agent/core
```

## Usage

```ts
import { ModalClient } from 'modal';
import { createCodeInterpreterTool } from '@ziro-agent/tools';
import { createModalSandboxAdapter } from '@ziro-agent/sandbox-modal';

const modal = new ModalClient();
const app = await modal.apps.fromName('my-app', { createIfMissing: true });
const image = modal.images.fromRegistry('python:3.12-slim');
const sandbox = await modal.sandboxes.create(app, image);
try {
  const tool = createCodeInterpreterTool({
    sandbox: createModalSandboxAdapter({ sandbox }),
  });
  // … wire `tool` into `createAgent` / `executeToolCalls`
} finally {
  await sandbox.terminate();
}
```

`typescript` requests use `node -e` like `javascript` (no typechecker in-box).
