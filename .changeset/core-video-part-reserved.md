---
"@ziro-agent/core": patch
"@ziro-agent/openai": patch
"@ziro-agent/google": patch
"@ziro-agent/anthropic": patch
"@ziro-agent/ollama": patch
---

Add reserved `VideoPart` to `UserMessage` content union; normalize + token estimate; Ollama preflight rejects `video`; chat providers throw `UnsupportedPartError` until mapping exists (RFC 0014).
