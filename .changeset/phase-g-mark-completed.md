---
'@ziro-agent/core': minor
'@ziro-agent/checkpoint-redis': patch
---

Add `ResumableStreamEventStore.markCompleted(resumeKey)` (RFC 0017 Phase G) to forcibly close incomplete sessions without appending a terminal part. Implemented on `InMemoryResumableStreamEventStore` and `RedisResumableStreamEventStore`. Document cookbook sections for `markCompleted` and budget semantics for replay vs continue-upstream.
