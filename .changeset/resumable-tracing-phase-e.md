---
'@ziro-agent/core': patch
'@ziro-agent/tracing': minor
---

Add `instrumentResumableStreams()` mapping resumable stream observer phases to OpenTelemetry spans and events (RFC 0017 Phase E). `setResumableStreamObserver` now returns the previous observer for chaining. Emit `replay_end` when the continue-upstream path errors after `replay_start` so instrumentation can always close the replay span.
