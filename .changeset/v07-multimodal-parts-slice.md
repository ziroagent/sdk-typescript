---
"@ziro-agent/core": minor
"@ziro-agent/openai": patch
"@ziro-agent/anthropic": patch
"@ziro-agent/google": patch
"@ziro-agent/ollama": patch
---

**v0.7 multimodal slice (I2 + I3 — types + provider mapping)**

- **@ziro-agent/core** — `AudioPart` / `FilePart`; `normalizePrompt`; `estimateTokensFromMessages` heuristics; `resolveMediaInput()` for data URLs / bytes / http(s) & `file:` URLs; `UnsupportedPartError`; `assertProviderMapsUserMultimodalParts()` (Ollama only — stable chat API has no audio/file fields).
- **@ziro-agent/openai** — `input_audio` (wav/mp3, inline only); `file` (`file-…` id or `file_data` base64).
- **@ziro-agent/anthropic** — `document` for PDF (base64 or URL) and plain text (base64); audio still unsupported at API level → `UnsupportedPartError`.
- **@ziro-agent/google** — Gemini `inlineData` / `fileData` for audio and file parts.
- **@ziro-agent/ollama** — audio/file remain unsupported (`images[]` only) → `UnsupportedPartError`.

ROADMAP §v0.7: I2/I3 updated for per-provider coverage; H4/H5 unchanged.
