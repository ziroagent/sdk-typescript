# RFC 0011: Memory tiers (working / conversation / long-term)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design TBD before v0.4 milestone start)
- Affected packages: `@ziro-agent/memory`, `@ziro-agent/agent`, `@ziro-agent/core`
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.4) and §A rows E1, O2

## Summary

Promote the existing vector-only `@ziro-agent/memory` into a three-tier memory
system: **working memory** (per-run scratchpad), **conversation memory**
(session sliding window with auto-summarise), and **long-term memory** (the
existing vector store). Today we ship only the long-term layer, leaving
context-window management and per-session continuity to consumers.

## Scope

- `WorkingMemory` interface + Mastra-style scopes (`'resource' | 'thread'`),
  markdown-block storage as canonical format.
- `ConversationMemory` interface with sliding-window strategy + automatic
  summary-on-overflow hook (`compress(messages, ctx) => messages`).
- `MemoryProcessor` middleware pattern: `trim`, `summarise`, `inject` —
  composable per RFC 0005 middleware shape.
- Adapter parity: in-memory + pgvector + (P1) libSQL, Redis.
- `Agent.memory` field accepting `{ working?, conversation?, longTerm? }`.
- Tracing: `ziro.memory.{read,write,compress}` spans nested under step spans.

## Non-goals

- Full Letta-style tiered memory (Core / Archival / Recall) — explicit reject
  in RFC 0004 anti-roadmap; we ship working + conversation + vector only.
- Self-editing memory tools (`core_memory_append`) — explicit reject (security).
- Knowledge graph (E7 in RFC 0008) — P2, not in scope.

## Open questions (defer to detailed design)

- Should `WorkingMemory` and `Checkpointer` share a backend? (RFC 0004 Q1 still
  open — RFC 0011 must close it.)
- Auto-summarise default: never (consumer opts in) or on token-budget breach?
- Markdown-block storage is human-readable but lossy for structured data —
  is JSON-blob fallback worth the complexity?

## Detailed design

TBD before v0.4 milestone start. Owner to draft.

## Implementation notes (2026-04)

- **`WorkingMemory` + `InMemoryWorkingMemory`** shipped in `@ziro-agent/memory`
  (markdown scratchpad, `scope: 'resource' | 'thread'`).
- **`ConversationMemory`**: `SlidingWindowConversationMemory`,
  `SummarizingConversationMemory` (`onOverflow` hook).
- **`MemoryProcessor`**: `composeMemoryProcessors`, `trimNonSystemMessageCount`.
- **`createAgent({ memory })`**: working injection (`injectWorkingMemoryIntoMessages`),
  processor chain, conversation `prepareForModel` before each `generateText`;
  `agent.memory.longTerm` for app-held `VectorStore`.
- Durable conversation store, **`MemoryProcessor` OTel spans**, and richer
  `compress()` defaults — still open.
