# multi-agent-workflow

Four single-purpose agents (planner → writer → critic → editor) orchestrated
by `@ziro-ai/workflow`. Demonstrates static graph edges, shared mutable state,
and the agent loop running inside a workflow node.

```bash
export OPENAI_API_KEY=sk-...
pnpm --filter @ziro-ai/example-multi-agent-workflow start "your topic here"
```
