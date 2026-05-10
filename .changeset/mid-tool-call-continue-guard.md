---
'@ziro-agent/core': minor
'@ziro-agent/tracing': patch
---

Reject `streamText({ continueUpstream: true })` when the persisted stream tail is mid-tool-call or implies pending tool execution: new `ContinueUpstreamMidToolCallError`, `tailBlocksContinueUpstream`, and observer phase `continue_upstream_blocked_mid_tool_call`. Tracing maps that phase to `ziro.resumable.continue_upstream_blocked_mid_tool_call`.
