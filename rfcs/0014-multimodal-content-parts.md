# RFC 0014: Multi-modal content parts (audio / file / video)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design TBD before v0.7 milestone start)
- Affected packages: `@ziro-agent/core`, every `@ziro-agent/providers-*`
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.7) and §A rows I2, I3, I4, I5

## Summary

Extend `UserMessage.content` parts beyond `text` and `image` to cover **audio**
and **file** (PDF / DOCX / CSV / arbitrary binary). Add separate model
interfaces for image generation and TTS / STT (P1) so Ziro covers the full
2026 multi-modal surface. Large payloads (>1 MB) go through `FileHandle` URL
references instead of base64 inlining.

## Scope

- `Part` union extension: `AudioPart`, `FilePart` (P0); **`VideoPart`** (P2 —
  type + normalization; **Google Gemini** maps to `inlineData` / `fileData`;
  OpenAI / Anthropic / Ollama still emit `UnsupportedPartError`).
- `FileHandle` type: opaque URL or upload-and-reference handle; providers
  resolve via signed-URL fetch.
- Provider parity: every shipped provider (`@ziro-agent/openai`, `anthropic`,
  `google`, `ollama`) implements `audio` + `file` parts where the upstream API
  supports it; emits `UnsupportedPartError` with provider hint where it does
  not.
- Pricing-data update: audio / file tokens accounted separately
  (per RFC 0008 row O1's reasoning-token precedent — different unit price
  classes).
- Separate model surfaces (P1):
  - `createImage({ prompt, model })` returning `ImagePart[]`.
  - `transcribe({ audio, model })` returning `string`.
  - `speak({ text, voice, model })` returning `AudioPart`.
- `AgentSnapshot` version bump (v2 → v3) reserved for content-part addition.

## Non-goals

- Coupling TTS / STT into the chat agent loop — these are separate model
  surfaces, not chat-completion replacements.
- Realtime / streaming voice agents (Realtime API + WebRTC) — explicit
  post-v1 future-work item per existing ROADMAP.
- A unified `mediaProcessing` package — keep parts and model surfaces in
  `@ziro-agent/core`; provider-specific bits in providers.

## Open questions (defer to detailed design)

- `FileHandle` resolution: providers fetch the URL themselves, or the SDK
  uploads to provider-storage first? Trade-off: latency vs. provider lock-in.
- Does `audio` part carry sample-rate / format hints, or is the provider
  expected to autodetect?
- Image generation: `ImagePart[]` (multi-image return) or single?

## Detailed design

TBD before v0.7 milestone start. Owner to draft.
