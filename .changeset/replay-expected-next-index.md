---
'@ziro-agent/core': minor
---

Add optional `expectedNextIndex` on replay-mode `streamText({ resumeKey, ... })` so clients can assert the server log length (`getSessionMeta().nextIndex`) and fail fast on stale tabs or split-brain reconnects.
