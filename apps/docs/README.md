# @ziro-agent/docs

Documentation site for the ZiroAgent SDK, built with
[Fumadocs](https://fumadocs.dev/) on top of Next.js 16.

## Develop

```bash
pnpm install
pnpm --filter @ziro-agent/docs dev
# → http://localhost:4001
```

## Generate the API reference

The reference under `/api/*` is produced from TSDoc comments:

```bash
pnpm --filter @ziro-agent/docs api:generate
```
