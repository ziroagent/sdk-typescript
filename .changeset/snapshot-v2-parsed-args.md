---
'@ziro-agent/agent': minor
'@ziro-agent/tools': minor
---

**Snapshot v2 — `parsedArgs` on `resolvedSiblings` + `migrateSnapshot()` helper**

Closes the v1 fidelity gap where `agent.resume(snapshot)` reconstructed
`resolvedSiblings` tool calls with `args: undefined`. v2 snapshots now
carry `parsedArgs` on every `ToolExecutionResult`, so the synthesised
step on resume includes the validated input the tool actually received
— restoring 1:1 conversation fidelity across HITL pauses.

Closes RFC 0002 amend (RFC 0004 §v0.1.9 trust-recovery).

Changes:

- `@ziro-agent/agent`
  - `AgentSnapshot.version` is now `1 | 2`. New snapshots emit `2`.
  - New exports: `CURRENT_SNAPSHOT_VERSION`, `SnapshotVersion`,
    `migrateSnapshot(snapshot)`, plus `Checkpointer` /
    `CheckpointId` / `CheckpointMeta` types from RFC 0006.
  - `agent.resume()` runs the input through `migrateSnapshot()`
    transparently. v1 snapshots persisted before v0.1.9 keep
    resuming for the documented 12-month support window
    (`apps/docs/content/docs/migration.mdx`).
- `@ziro-agent/tools`
  - `ToolExecutionResult.parsedArgs?: unknown` is populated on every
    code path (success, failure, budget overrun, approval
    short-circuit, reject, suspend). Optional for backwards compat;
    consumers that don't need it can ignore it.

Migration:

- No code change required. Old snapshots auto-migrate on `resume`.
- Persistence-layer schemas may want to start indexing
  `version` so future migrations are easy to query.
