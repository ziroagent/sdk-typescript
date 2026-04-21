# Example: stub sandbox + browser tools

Runs `code_interpreter` and `browser_goto` against **core stub adapters** (no E2B API key, no Playwright install). Uses `executeToolCalls` with an auto-approver because these tools are `mutates: true`.

```bash
pnpm --filter @ziro-agent/example-sandbox-stub-tools start
```

For real sandboxes, add `@ziro-agent/sandbox-e2b` and/or `@ziro-agent/browser-playwright` and replace the stub constructors as noted in `index.ts`.
