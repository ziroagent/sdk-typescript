# Security Policy

## Supported Versions

Until v1.0, only the latest minor release receives security updates.

| Version | Supported |
| ------- | --------- |
| 0.x     | Latest minor only |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Use [GitHub Security Advisories](https://github.com/ziro-ai/sdk/security/advisories/new) to report privately, or email **security@ziro-ai.dev**.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof-of-concept.
- Affected package(s) and version(s).
- Any suggested mitigation.

## What to expect

- We acknowledge receipt within **3 business days**.
- We provide an initial assessment within **7 business days**.
- We aim to release a fix within **30 days** for high-severity issues.
- We will credit you in the security advisory unless you prefer to remain anonymous.

## Supply chain

All packages are published to npm with [provenance attestations](https://docs.npmjs.com/generating-provenance-statements). Verify with:

```bash
npm audit signatures
```
