# @ziro-agent/audit

## 0.3.0

### Minor Changes

- [#74](https://github.com/ziroagent/sdk-typescript/pull/74) [`2c590ad`](https://github.com/ziroagent/sdk-typescript/commit/2c590adb0038a8fe4dc32b5ee62a4f9274ba4df1) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **@ziro-agent/agent** — `createReplayAgentFromRecording`, `createReplayRunBundleFromRecording`, and `ReplayRunBundle` (RFC 0015 replay sugar).

  **@ziro-agent/audit** — `verifyJsonlAuditLogChain` / `verifyJsonlAuditLogFile` for hash-chain integrity.

  **@ziro-agent/tracing** — `ATTR.MemoryWorkingCharCount` + `ziro.memory.read` event payload on working-memory span.

## 0.2.0

### Minor Changes

- **@ziro-agent/audit** — Initial release: append-only JSONL audit log with SHA-256 hash chain (`JsonlAuditLog`, `canonicalJsonStringify`).

  **@ziro-agent/compliance** — Initial release: ordered `deleteUserDataInOrder`, `buildComplianceReportJson`, EU AI Act draft template helper.

  **@ziro-agent/memory** — Conversation snapshot store (`DirConversationSnapshotStore`, `PersistingConversationMemory`), deterministic `createDroppedMessagesSnippetCompressor` for summarising memory.

  **@ziro-agent/agent** — OpenTelemetry spans around the memory pipeline in `buildLlmMessages`; `replayAgentFromRecording` / `replayAgentFromRecordingJsonl` helpers for recorded runs.

  **@ziro-agent/middleware** — Optional adaptive fallback ordering (`adaptive` on `modelFallback`, `resetModelFallbackAdaptiveState`).

  **@ziro-agent/tracing** — New span attribute keys for memory phases and thread correlation (`ATTR.ThreadId`, `MemoryPhase`, `MemoryProcessorIndex`, `MemoryProcessorCount`).

  **@ziro-agent/cli** — `ziroagent compliance report` and `ziroagent compliance eu-ai-act-template` commands.
