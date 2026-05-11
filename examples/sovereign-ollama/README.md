# sovereign-ollama

One-shot **`generateText`** against a **local [Ollama](https://ollama.com)** server — no OpenAI/Groq/Gemini keys. Useful for sovereign / offline demos.

## Prereqs

- [Ollama](https://ollama.com) installed and running (`ollama serve`).
- A model pulled locally, e.g. `ollama pull llama3.2`.

## Run

```bash
pnpm --filter @ziro-agent/example-sovereign-ollama start
```

Optional:

```bash
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=llama3.2
```

## See also

- [`examples/groq-chat`](../groq-chat) — fastest cloud inference (`GROQ_API_KEY`).
- [`examples/basic-chat`](../basic-chat) — OpenAI-compatible remote API.
