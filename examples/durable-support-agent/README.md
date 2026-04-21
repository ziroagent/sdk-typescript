# Durable support agent (Inngest + Ziro)

Shows **`createInngestAgent`** from `@ziro-agent/inngest` with a **`MemoryCheckpointer`**: the agent run executes inside an Inngest-style `step.run` boundary, suspends when a tool needs approval, persists the snapshot through the checkpointer, then a second “resume” invocation continues after a human decision.

**No API keys** — uses a small scripted mock `LanguageModel`.

## Run the simulation

This example ships a **minimal in-memory Inngest stub** (registers the same functions `createInngestAgent` would register against a real `Inngest` client) so you can see the full run → suspend → resume flow without `inngest dev`:

```bash
pnpm --filter @ziro-agent/example-durable-support-agent start
```

## Production shape

1. `new Inngest({ id: 'your-app' })` + `createInngestAgent({ inngest, agent })`.
2. Pass the returned `runFn` / `resumeFn` to `serve({ functions })` from `inngest/express`, `inngest/next`, etc.
3. Trigger runs with `inngest.send({ name: 'ziro/agent.run.requested', data: { threadId, prompt } })`.
4. After suspension, your approval UI sends `ziro/agent.resume.requested` with `{ threadId, decisions }` (and optionally `checkpointId`).

Swap `MemoryCheckpointer` for `@ziro-agent/checkpoint-redis` or `@ziro-agent/checkpoint-postgres` when you need multi-process durability.

See [`@ziro-agent/inngest` README](../../packages/inngest/README.md) for the full contract.
