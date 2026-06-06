---
'@ziro-agent/audit': minor
---

Optional HMAC signing for the audit chain — upgrades it from tamper-**detection** to tamper-**evidence**.

- `new JsonlAuditLog(path, { hmacKey })` signs each record with HMAC-SHA256 (`alg: 'hmac-sha256'`), so a writer who does not hold the key cannot forge a valid downstream chain. Keep the key in a KMS / secret manager.
- `verifyJsonlAuditLogChain(content, { hmacKey })` / `verifyJsonlAuditLogFile(path, { hmacKey })` verify signed logs and **fail closed** if the key is missing or wrong.
- Fully backward compatible: existing unkeyed (SHA-256) logs verify unchanged, and per-record `alg` lets mixed/legacy logs validate. New exports: `JsonlAuditLogOptions`, `VerifyJsonlAuditLogChainOptions`, `auditDigestHex`.
