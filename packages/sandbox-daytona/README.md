# @ziro-agent/sandbox-daytona

Maps a Daytona [`Sandbox`](https://www.daytona.io/docs) to ZiroAgent [`SandboxAdapter`](https://github.com/ziroagent/sdk-typescript) for `createCodeInterpreterTool()` from `@ziro-agent/tools`.

## Install

```bash
pnpm add @ziro-agent/sandbox-daytona @daytonaio/sdk @ziro-agent/core
```

Configure `DAYTONA_API_KEY` (and optional `DAYTONA_API_URL` / `DAYTONA_TARGET`) per [Daytona docs](https://www.daytona.io/docs).

## Usage

```ts
import { Daytona } from '@daytonaio/sdk';
import { createCodeInterpreterTool } from '@ziro-agent/tools';
import { createDaytonaSandboxAdapter } from '@ziro-agent/sandbox-daytona';

const daytona = new Daytona();
const sandbox = await daytona.create({ language: 'python' });
const adapter = createDaytonaSandboxAdapter({ sandbox });
const codeInterpreter = createCodeInterpreterTool({ sandbox: adapter });
```

`python` uses `sandbox.process.codeRun`. `javascript` / `typescript` use `bash -lc 'node -e …'`; prefer a TypeScript-labelled sandbox from Daytona if you rely on `codeRun` semantics for TS.
