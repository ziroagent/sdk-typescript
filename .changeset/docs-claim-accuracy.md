---
'@ziro-agent/audit': patch
---

Document the audit hash-chain's real security scope: the unkeyed SHA-256 chain provides tamper-**detection** (catches edits if you retain the tip hash out-of-band), not cryptographic tamper-**evidence** against an attacker with file write access. For regulator-grade trails (EU AI Act, SOC 2), anchor the chain with HMAC/signing, an external timestamp/notary, or WORM storage. README claims updated to match.
