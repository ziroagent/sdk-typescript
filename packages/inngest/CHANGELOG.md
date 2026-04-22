# @ziro-agent/inngest

## 0.3.5

### Patch Changes

- [#49](https://github.com/ziroagent/sdk-typescript/pull/49) [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Forward `budget` and `toolBudget` from Inngest run/resume event payloads into `agent.run` / `resumeFromCheckpoint`.

- Updated dependencies [[`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e), [`48303a7`](https://github.com/ziroagent/sdk-typescript/commit/48303a7dac0dcc249600a27da8edd7507ecf917e)]:
  - @ziro-agent/agent@0.11.0

## 0.3.4

### Patch Changes

- [#45](https://github.com/ziroagent/sdk-typescript/pull/45) [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Forward `budget` and `toolBudget` from Inngest run/resume event payloads into `agent.run` / `resumeFromCheckpoint`.

- Updated dependencies [[`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14), [`5e77412`](https://github.com/ziroagent/sdk-typescript/commit/5e77412a0d2e69c1a5d5960f529370e58bff4e14)]:
  - @ziro-agent/agent@0.10.0

## 0.3.3

### Patch Changes

- [#42](https://github.com/ziroagent/sdk-typescript/pull/42) [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Forward `budget` and `toolBudget` from Inngest run/resume event payloads into `agent.run` / `resumeFromCheckpoint`.

- Updated dependencies [[`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`15fb70f`](https://github.com/ziroagent/sdk-typescript/commit/15fb70f142d8e481f365bd44cf09e28730d4fdce), [`3f3695d`](https://github.com/ziroagent/sdk-typescript/commit/3f3695d760ba00daaf1850ff4970c9069e42533d), [`019b2cd`](https://github.com/ziroagent/sdk-typescript/commit/019b2cdee2edb1acb213b22b86d3dedef4146252), [`fb35dc0`](https://github.com/ziroagent/sdk-typescript/commit/fb35dc0e04a6e802e4bf141108d39b703f5a74c7)]:
  - @ziro-agent/agent@0.9.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d), [`8cbcd93`](https://github.com/ziroagent/sdk-typescript/commit/8cbcd93ca9a1797a14790d886dade9860990896d)]:
  - @ziro-agent/agent@0.8.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`b2ce8c9`](https://github.com/ziroagent/sdk-typescript/commit/b2ce8c95e7333d5ac880bfd9f49e3f878f5eddab)]:
  - @ziro-agent/agent@0.7.0

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
