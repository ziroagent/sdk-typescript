# RFC 0011: Memory tiers (working / conversation / long-term)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **draft** (§Detailed design sketched 2026-04; working + conversation + processors + `createAgent({ memory })` shipped; durable conversation store + MemoryProcessor OTel + richer `compress()` defaults still open)
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

### 1. Tier roles

| Tier | Purpose | Persistence | Typical size |
|------|---------|-------------|----------------|
| **Working** | Scratchpad merged into the first **system** message each LLM step | `InMemoryWorkingMemory` today (pluggable `WorkingMemory`) | Small markdown block |
| **Conversation** | Trim / summarise **message list** before model sees it | In-process; optional future durable adapter | Bounded by window + summariser |
| **Long-term** | RAG / tools: **`VectorStore`** held by app, exposed as `agent.memory.longTerm`** | Backend-defined (pgvector, in-memory, …) | Large |

### 2. Per-step pipeline (agent loop)

Before each `generateText` for step `k`:

1. Start from checkpoint / in-flight **`ChatMessage[]`**.
2. **Working:** `injectWorkingMemoryIntoMessages` — prepend/merge working markdown into the first `system` message (or create one).
3. **Processors:** `composeMemoryProcessors([...])` — each `process(msgs, { threadId, stepIndex })` returns a new list (trim, redact, etc.).
4. **Conversation:** `conversation.prepareForModel(msgs, ctx)` — sliding window and/or summarisation hook.

Full history for checkpoints and `AgentRunResult.messages` remains the **unshrunk** trail where applicable; transforms apply to a **copy** path for the model payload (see implementation in `agent.ts`).

### 3. `WorkingMemory` contract

- **`read(): Promise<string>`** / **`write(markdown: string): Promise<void>`** (and related clear/delete as implemented).
- **`scope: 'resource' | 'thread'`** — resource = stable across threads for a user/tenant; thread = per `threadId` / conversation.

### 4. `ConversationMemory` strategies

- **`SlidingWindowConversationMemory`:** cap message count or tokens (strategy-specific options).
- **`SummarizingConversationMemory`:** overflow triggers `onOverflow` / compress hook to fold older turns into summary messages.

### 5. `MemoryProcessor`

- Pure functions / objects: **`process(messages, ctx) => ChatMessage[] | Promise<>`**.
- **`trimNonSystemMessageCount`** and **`composeMemoryProcessors`** for ordering (first processor sees the newest state after working injection).

### 6. Open extensions (post-v0.4 target)

- **Durable `ConversationMemory` backend** (same interface, different storage).
- **OTel:** spans or events `ziro.memory.read` / `write` / `compress` under agent step spans (align with `@ziro-agent/tracing` ATTR conventions).
- **Default `compress()` policy** — opt-in vs token-budget-triggered (see Open questions).

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
