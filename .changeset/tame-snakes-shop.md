---
'@ziro-agent/core': minor
'@ziro-agent/checkpoint-redis': minor
---

Add resumable `streamText` support with `resumeKey` replay in `@ziro-agent/core`, including a pluggable `ResumableStreamEventStore` API and in-memory store export.

Add `RedisResumableStreamEventStore` to `@ziro-agent/checkpoint-redis` so resumable stream event logs can be persisted in Redis with optional TTL.
