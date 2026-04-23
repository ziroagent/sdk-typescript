---
'@ziro-agent/compliance': minor
'@ziro-agent/memory': patch
---

Add `deleteAgentCheckpointsForThreads` (duck-typed checkpointer bridge) and `deleteConversationSnapshotThreads` for RFC 0016 user-data deletion wiring.

On `@ziro-agent/memory/node`, export `resolveFileBackedWorkingMemoryPath` and `deleteFileBackedWorkingMemoryFiles` for durable working-memory cleanup aligned with the same RFC.
