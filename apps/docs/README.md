# @ziro-ai/docs

Documentation site for the Ziro AI SDK, built with
[Fumadocs](https://fumadocs.dev/) on top of Next.js 16.

## Develop

```bash
pnpm install
pnpm --filter @ziro-ai/docs dev
# → http://localhost:4001
```

## Generate the API reference

The reference under `/api/*` is produced from TSDoc comments:

```bash
pnpm --filter @ziro-ai/docs api:generate
```
