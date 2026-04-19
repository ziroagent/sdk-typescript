# @ziro-agent/playground

Local development playground for the ZiroAgent SDK. Provides a chat UI, a live
trace viewer, and a session list for inspecting LLM calls during iteration.

## Run locally

```bash
cp .env.example .env.local  # set OPENAI_API_KEY (or ANTHROPIC_API_KEY)
pnpm install
pnpm --filter @ziro-agent/playground dev
# → http://localhost:4000
```

## Configuration

| Var               | Default            | Description                         |
| ----------------- | ------------------ | ----------------------------------- |
| `ZIRO_PROVIDER`   | `openai`           | `openai` or `anthropic`             |
| `ZIRO_MODEL`      | provider-specific  | Model id, e.g. `gpt-4o-mini`        |
| `OPENAI_API_KEY`  | —                  | Required when provider is `openai`  |
| `ANTHROPIC_API_KEY` | —                | Required when provider is `anthropic` |

The playground is intentionally dev-only — sessions live in process memory
and are lost on restart.
