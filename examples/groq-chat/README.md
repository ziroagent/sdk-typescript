# groq-chat

Minimal [`generateText`](https://ziroagent.com) call against [Groq Cloud](https://console.groq.com/)
using the OpenAI-compatible endpoint (`@ziro-agent/groq`).

```bash
export GROQ_API_KEY=gsk_...
# Optional — defaults to llama-3.3-70b-versatile
export GROQ_MODEL=llama-3.3-70b-versatile

pnpm install
pnpm --filter @ziro-agent/example-groq-chat start
```

Requires Node **≥20.10** (same as the SDK).
