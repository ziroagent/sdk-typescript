# @ziro-agent/sandbox-e2b

Maps an [E2B code interpreter](https://e2b.dev) sandbox to ZiroAgent [`SandboxAdapter`](https://github.com/ziroagent/sdk-typescript) for use with `createCodeInterpreterTool()` from `@ziro-agent/tools`.

## Install

```bash
pnpm add @ziro-agent/sandbox-e2b @e2b/code-interpreter @ziro-agent/core
```

Set `E2B_API_KEY` in your environment.

## Usage

```ts
import { Sandbox } from '@e2b/code-interpreter';
import { createCodeInterpreterTool } from '@ziro-agent/tools';
import { createE2bSandboxAdapter } from '@ziro-agent/sandbox-e2b';

const e2b = await Sandbox.create();
const sandbox = createE2bSandboxAdapter({ sandbox: e2b });
const codeInterpreter = createCodeInterpreterTool({ sandbox });
```
