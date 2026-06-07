---
'@ziro-agent/anthropic': minor
---

Anthropic prompt caching: opt-in `cache_control` auto-injection (S3 / provider depth).

Pass `providerOptions: { cacheControl: true }` (or `{ system?: boolean; tools?: boolean }`) to `generateText` / `streamText` / the agent, and the provider stamps `cache_control: { type: 'ephemeral' }` on the **stable prefix** — the `system` block and the last tool definition — so Anthropic caches everything up to that point. The flag is consumed by the provider and never leaks into the wire body; raw message-level caching is still available via a `providerOptions.messages` override. Cache hit/write accounting (`cachedPromptTokens`) was already surfaced. OpenAI prompt caching is automatic server-side and already reflected in `usage.cachedPromptTokens` — no client flag needed.
