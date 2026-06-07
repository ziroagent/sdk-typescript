# @ziro-agent/audit

## 0.4.0

### Minor Changes

- [#143](https://github.com/ziroagent/sdk-typescript/pull/143) [`a094936`](https://github.com/ziroagent/sdk-typescript/commit/a094936cde5e192af41eba90abfe80718c1df995) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Optional HMAC signing for the audit chain — upgrades it from tamper-**detection** to tamper-**evidence**.

  - `new JsonlAuditLog(path, { hmacKey })` signs each record with HMAC-SHA256 (`alg: 'hmac-sha256'`), so a writer who does not hold the key cannot forge a valid downstream chain. Keep the key in a KMS / secret manager.
  - `verifyJsonlAuditLogChain(content, { hmacKey })` / `verifyJsonlAuditLogFile(path, { hmacKey })` verify signed logs and **fail closed** if the key is missing or wrong.
  - Fully backward compatible: existing unkeyed (SHA-256) logs verify unchanged, and per-record `alg` lets mixed/legacy logs validate. New exports: `JsonlAuditLogOptions`, `VerifyJsonlAuditLogChainOptions`, `auditDigestHex`.

### Patch Changes

- [#143](https://github.com/ziroagent/sdk-typescript/pull/143) [`a094936`](https://github.com/ziroagent/sdk-typescript/commit/a094936cde5e192af41eba90abfe80718c1df995) Thanks [@vokhoadev](https://github.com/vokhoadev)! - Document the audit hash-chain's real security scope: the unkeyed SHA-256 chain provides tamper-**detection** (catches edits if you retain the tip hash out-of-band), not cryptographic tamper-**evidence** against an attacker with file write access. For regulator-grade trails (EU AI Act, SOC 2), anchor the chain with HMAC/signing, an external timestamp/notary, or WORM storage. README claims updated to match.

## 0.3.1

### Patch Changes

- [#76](https://github.com/ziroagent/sdk-typescript/pull/76) [`2848361`](https://github.com/ziroagent/sdk-typescript/commit/284836105d590a181e1c265082945d3c493fb5ef) Thanks [@vokhoadev](https://github.com/vokhoadev)! - **@ziro-agent/cli** — `ziroagent audit verify <file.jsonl>`; compliance `report` supports `--versions-file` and `--versions-json`.

  **@ziro-agent/compliance** — `ComplianceReportInput.packageVersions` and SOC2 / JSON report sections.

  **@ziro-agent/audit** — Test coverage for tampered hash detection in `verifyJsonlAuditLogChain`.

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
