# @ziro-agent/inngest

[Inngest](https://www.inngest.com) durable execution adapter for the
ZiroAgent SDK. Wrap an `Agent` in an Inngest function and get:

- **Resumability**: each agent run lives inside a `step.run(...)` so a
  crash mid-execution does not re-issue the LLM call on retry.
- **HITL via events**: when the agent suspends for human approval, the
  snapshot is persisted via your `Checkpointer` and Inngest stops the
  function. Resume by sending a `ziro/agent.resume.requested` event
  carrying the decisions.
- **No HTTP plumbing**: Inngest already handles signing, retries, and
  event ingestion. We just wire the agent into the `step` API.

```bash
pnpm add @ziro-agent/inngest @ziro-agent/agent inngest
```

## Quick start

```ts
import { Inngest } from 'inngest';
import { createAgent } from '@ziro-agent/agent';
import { RedisCheckpointer, fromIoRedis } from '@ziro-agent/checkpoint-redis';
import { createInngestAgent } from '@ziro-agent/inngest';
import { openai } from '@ziro-agent/openai';
import IORedis from 'ioredis';

const inngest = new Inngest({ id: 'my-app' });

const agent = createAgent({
  name: 'support',
  model: openai('gpt-4o-mini'),
  checkpointer: new RedisCheckpointer({ client: fromIoRedis(new IORedis()) }),
  defaultThreadId: 'placeholder', // overridden per-event
});

const { runFn, resumeFn } = createInngestAgent({ inngest, agent });

// pass to inngest's HTTP serve
export const functions = [runFn, resumeFn].filter(Boolean);

// trigger a run
await inngest.send({
  name: 'ziro/agent.run.requested',
  data: { threadId: 'user:42', prompt: 'Refund order #123' },
});
```

When the agent calls a tool with `requiresApproval`, it throws
`AgentSuspendedError`. The adapter:

1. Persists the snapshot via `agent.checkpointer.put(threadId, snapshot)`
   inside its own `step.run` boundary.
2. Rethrows an `InngestAgentSuspendedError` carrying the `checkpointId`.
3. Inngest stops the function execution.

To resume, fire the resume event from your approval UI:

```ts
await inngest.send({
  name: 'ziro/agent.resume.requested',
  data: {
    threadId: 'user:42',
    decisions: { tc_abc: { decision: 'approve' } },
  },
});
```

## Lower-level helpers

If `createInngestAgent` is too opinionated, compose the building blocks
yourself:

```ts
import { runAsStep, resumeAsStep } from '@ziro-agent/inngest';

const myFn = inngest.createFunction(
  { id: 'support-bot', retries: 3 },
  { event: 'app/chat.received' },
  async ({ event, step }) => {
    return runAsStep(step, agent, {
      prompt: event.data.message,
      threadId: event.data.userId,
    });
  },
);
```

## Why Inngest?

For agent workloads you specifically want:

- **Step memoization**: an agent run with 5 LLM steps that crashes after
  step 3 should NOT re-issue the first 3 LLM calls on retry. Inngest
  + the Ziro `Checkpointer` make this automatic.
- **Long-pending HITL**: a customer might take hours to approve a
  refund. Pure-process state machines lose this on deploy. Inngest
  events survive deploys, restarts, and even region failovers.
- **Schedules + crons**: easy to add a "follow-up if no reply in 24h"
  workflow on top of the same agent.

Comparable trade-offs vs `@ziro-agent/checkpoint-redis` alone:

| Need                                  | Plain checkpointer | + Inngest |
| ------------------------------------- | ------------------ | --------- |
| Pause/resume across deploys           | ✅                 | ✅        |
| Crash-safe LLM step memoization       | ❌                 | ✅        |
| Cron / scheduled triggers             | ❌                 | ✅        |
| Out-of-band event triggers            | ❌                 | ✅        |
| Retry policies + dead-letter handling | ❌                 | ✅        |
| Operational dashboard                 | ❌                 | ✅        |

If you don't need any of the right-column features, the checkpointer
alone is enough. Add this adapter when those needs show up.
