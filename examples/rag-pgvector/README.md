# rag-pgvector

End-to-end RAG with `@ziro-agent/memory`'s Postgres + pgvector adapter. Indexes
a small knowledge base, retrieves the top-K passages for the question on the
command line, and prompts the LLM with the retrieved context.

## Prereqs

- Postgres 14+ with the [`pgvector`](https://github.com/pgvector/pgvector)
  extension installed (`CREATE EXTENSION vector;` runs automatically).
- `OPENAI_API_KEY` and `DATABASE_URL` env vars.

```bash
export OPENAI_API_KEY=sk-...
export DATABASE_URL=postgres://user:pass@localhost:5432/ziro
pnpm --filter @ziro-agent/example-rag-pgvector start "How do tools work in Ziro?"
```
