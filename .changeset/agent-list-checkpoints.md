---
"@ziro-agent/agent": patch
---

Add `agent.listCheckpoints(threadId, opts?)` — delegates to the agent's `Checkpointer.list` for UI / pagination without holding the checkpointer separately.
