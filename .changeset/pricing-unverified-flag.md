---
'@ziro-agent/core': minor
---

**Pricing data: `unverified` flag for speculative model IDs (RFC 0004 §v0.1.9 trust-recovery)**

`ModelPricing` gains an optional `unverified?: boolean` field. Rows that
cannot be cross-referenced against a live provider pricing page (today:
`gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `claude-opus-4-7`,
`claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-opus-4-6`,
`claude-sonnet-4-5`) are now marked `unverified: true`.

`getPricing(provider, modelId)` filters unverified rows out by default.
Pre-flight USD enforcement falls back to the `chars / 4` heuristic
(same path as for unknown models) instead of trusting a speculative price
tag. Pass `getPricing(provider, modelId, { allowUnverified: true })` to
opt back in for internal dashboards / best-effort estimation.

**Verified rows (defaults still resolve normally):** `gpt-4o`,
`gpt-4o-mini`, `claude-sonnet-4`, `claude-opus-4`, `claude-opus-4-1`.

**Migration**: no user-facing API change. If you were depending on
pre-flight USD bounds for the speculative IDs above, your `BudgetGuard`
now falls back to the heuristic and you'll get post-call enforcement
instead of pre-flight throws. Catch `BudgetExceededError` with
`preflight: false` if you need to detect that path explicitly.
