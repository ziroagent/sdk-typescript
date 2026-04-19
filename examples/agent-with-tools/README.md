# agent-with-tools

A small Ziro agent that uses two type-safe tools (`getWeather`, `calculate`)
to answer a multi-step question. Demonstrates the agent loop, event
subscriptions, and `maxSteps`.

```bash
export OPENAI_API_KEY=sk-...
pnpm --filter @ziro-ai/example-agent-with-tools start
```
