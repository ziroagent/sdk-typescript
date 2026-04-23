---
"@ziro-agent/agent": minor
"@ziro-agent/compliance": minor
"@ziro-agent/cli": minor
"@ziro-agent/tracing": patch
---

**@ziro-agent/agent** — Node entry `@ziro-agent/agent/node` with `replayAgentRunFromRecordingFile` (JSONL path → replay run).

**@ziro-agent/compliance** — SOC2 starter `SOC2_CONTROL_MAP` and `renderSoc2MarkdownReport`.

**@ziro-agent/cli** — `compliance report --framework soc2` emits Markdown; default remains JSON.

**@ziro-agent/tracing** — `ATTR.MemoryProcessorName` for memory processor spans.
