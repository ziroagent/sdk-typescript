# @ziro-agent/inngest

## 0.3.0

### Minor Changes

- [`bba9d98`](https://github.com/ziroagent/sdk-typescript/commit/bba9d9813d8375b7bfad3bef37d93531d14c4b2d) - Three new v0.2 packages land together to round out the integration surface:

  - `@ziro-agent/checkpoint-redis` — Redis adapter for the `Checkpointer`
    interface (RFC 0006). Structural `RedisLike` client typing so consumers
    can plug in `ioredis`, node-redis v4+, or any custom transport.
    Per-thread sorted-set index + JSON snapshot keys with optional TTL.
  - `@ziro-agent/google` — Google Gemini provider hitting the Generative
    Language API (and Vertex AI when bring-your-own `Authorization` header
    is set). Streaming, tool calling (with synthesized stable ids since
    Gemini doesn't return them), and `estimateCost` integration.
  - `@ziro-agent/inngest` — Inngest durable execution adapter. Wraps
    agent runs in `step.run` for crash-safe memoization and persists
    HITL snapshots into the configured `Checkpointer` so resume works
    across deploys. Ships a `createInngestAgent({ inngest, agent })`
    factory plus lower-level `runAsStep` / `resumeAsStep` helpers.

  `@ziro-agent/core` widens `ModelPricing.provider` to include `'google'`
  and adds Gemini 2.0/2.5-series rate cards (2.5-series marked
  `unverified: true` per RFC 0004's trust-recovery convention).

### Patch Changes

- Updated dependencies [[`ec901c8`](https://github.com/ziroagent/sdk-typescript/commit/ec901c8554bc0f4e1577eeff8a5ab1b386c9097a)]:
  - @ziro-agent/agent@0.6.0
