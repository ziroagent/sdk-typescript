# @ziro-agent/checkpoint-memory

In-memory reference [`Checkpointer`](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0006-checkpointer.md)
implementation for ZiroAgent SDK.

> **Status — v0.1.x.** Reference adapter for tests, examples, and
> single-process deployments. The interface is stable; production
> deployments should use `@ziro-agent/checkpoint-postgres` or
> `@ziro-agent/checkpoint-redis` (both ship in v0.2 — see
> [RFC 0006](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0006-checkpointer.md)).

## Install

```bash
npm install @ziro-agent/checkpoint-memory @ziro-agent/agent
```

## Usage

```ts
import { createAgent, AgentSuspendedError } from '@ziro-agent/agent';
import { MemoryCheckpointer } from '@ziro-agent/checkpoint-memory';

const checkpointer = new MemoryCheckpointer();
const agent = createAgent({ /* ... */ });

try {
  await agent.run({ prompt: 'send the email' });
} catch (err) {
  if (err instanceof AgentSuspendedError) {
    const id = await checkpointer.put('thread-42', err.snapshot);
    // ... later, after a human approves out of band ...
    const snap = await checkpointer.get('thread-42', id);
    if (snap) await agent.resume(snap, { decisions: { /* ... */ } });
  }
}
```

## Why a separate package?

Keeping driver dependencies out of `@ziro-agent/agent` means one
adapter per storage layer with no peerDependency surprises. The
`Checkpointer` interface itself lives in `@ziro-agent/agent` and is
re-exported from every adapter so callers can swap implementations
without changing import paths.

## Limits

- Process-local — does not survive a restart.
- `maxCheckpointsPerThread` (default `100`) FIFO-evicts older entries.
- Snapshots are deep-cloned via `structuredClone` on read AND write to
  guarantee caller mutations cannot leak.

## License

Apache-2.0 © ZiroAgent
