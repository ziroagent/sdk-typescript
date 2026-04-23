# @ziro-agent/compliance

## 0.3.0

### Minor Changes

- [#72](https://github.com/ziroagent/sdk-typescript/pull/72) [`8e3c3d7`](https://github.com/ziroagent/sdk-typescript/commit/8e3c3d71d3f326ac311af34da8140c9d3e2e738a) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **@ziro-agent/agent** — Node entry `@ziro-agent/agent/node` with `replayAgentRunFromRecordingFile` (JSONL path → replay run).

  **@ziro-agent/compliance** — SOC2 starter `SOC2_CONTROL_MAP` and `renderSoc2MarkdownReport`.

  **@ziro-agent/cli** — `compliance report --framework soc2` emits Markdown; default remains JSON.

  **@ziro-agent/tracing** — `ATTR.MemoryProcessorName` for memory processor spans.

## 0.2.0

### Minor Changes

- **@ziro-agent/audit** — Initial release: append-only JSONL audit log with SHA-256 hash chain (`JsonlAuditLog`, `canonicalJsonStringify`).

  **@ziro-agent/compliance** — Initial release: ordered `deleteUserDataInOrder`, `buildComplianceReportJson`, EU AI Act draft template helper.

  **@ziro-agent/memory** — Conversation snapshot store (`DirConversationSnapshotStore`, `PersistingConversationMemory`), deterministic `createDroppedMessagesSnippetCompressor` for summarising memory.

  **@ziro-agent/agent** — OpenTelemetry spans around the memory pipeline in `buildLlmMessages`; `replayAgentFromRecording` / `replayAgentFromRecordingJsonl` helpers for recorded runs.

  **@ziro-agent/middleware** — Optional adaptive fallback ordering (`adaptive` on `modelFallback`, `resetModelFallbackAdaptiveState`).

  **@ziro-agent/tracing** — New span attribute keys for memory phases and thread correlation (`ATTR.ThreadId`, `MemoryPhase`, `MemoryProcessorIndex`, `MemoryProcessorCount`).

  **@ziro-agent/cli** — `ziroagent compliance report` and `ziroagent compliance eu-ai-act-template` commands.
