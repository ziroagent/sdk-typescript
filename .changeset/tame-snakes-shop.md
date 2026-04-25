---
'@ziro-agent/core': minor
'@ziro-agent/checkpoint-redis': minor
---

Add resumable `streamText` support with `resumeKey` replay in `@ziro-agent/core`, including a pluggable `ResumableStreamEventStore` API, in-memory store export, and optional per-stream `maxEventsPerStream` / `maxBytesPerStream` guards to prevent unbounded growth.

Extend `ResumableStreamEventStore` with `getSessionMeta` (RFC 0017 phase A): `nextIndex`, `completed` when a terminal `finish` / `error` part is stored, `updatedAt` on the in-memory store, and `isTerminalModelStreamPart` for consumers. Appends after completion are rejected.

Add `RedisResumableStreamEventStore` to `@ziro-agent/checkpoint-redis` so resumable stream event logs can be persisted in Redis with optional TTL plus matching per-stream `maxEventsPerStream` / `maxBytesPerStream` caps, optional `measurePartBytes` alignment with the in-memory store, and Redis keys for session meta / completion plus legacy log-tail detection for older keys without the `comp` flag.

Add `continueUpstream: true` on replay-mode `streamText({ resumeKey, ... })` so callers can replay cached events and, when the session is incomplete, continue live model generation in the same response while appending new parts back into the same resume log.

Add best-effort Redis continue-upstream coordination (`ziro:st:lock:<resumeKey>`, `SET NX EX`) via `acquireContinueLock` / `releaseContinueLock`, automatically used by `streamText({ continueUpstream: true })` when the store supports it.

Add resumable stream observability hooks in `@ziro-agent/core` (`setResumableStreamObserver`) with phase events for replay, continue-upstream, and continue-lock lifecycle so tracing integrations can emit spans without coupling core to a tracer SDK.
