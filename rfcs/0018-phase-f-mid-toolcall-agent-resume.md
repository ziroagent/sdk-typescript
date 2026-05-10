# RFC 0018: Phase F — Mid-tool-call logs and the agent loop (design draft)

- Start date: 2026-05-08
- Authors: @ziro-agent/maintainers
- Status: **draft** — design intent only; defers implementation to a future sprint
- Parent: [RFC 0017 — Resumable streamText](./0017-resumable-stream-continue-upstream.md) Phase **F** (Open)
- Related: [RFC 0002 — Human-in-the-loop](./0002-human-in-the-loop.md), `@ziro-agent/agent`

## Problem

When a resumable `ModelStreamPart` log ends **between tool-call boundary parts**
(e.g. after `tool-call` start but before matching tool results / terminal stream
state), raw `streamText({ continueUpstream: true })` may extend the log with a
**second model leg** that does not naturally resume **multi-step agent**
reasoning or pending tool execution semantics.

[RFC 0017 §Unresolved](./0017-resumable-stream-continue-upstream.md) asks whether
continuation belongs on **`streamText`** alone or on the **agent loop**.

## Recommendation (locked for implementation planning)

1. **Primary path:** Treat **mid-tool-call** incomplete logs as **agent-level**
   concerns. The host should recover via **[RFC 0002](./0002-human-in-the-loop.md)
   suspend/resume** or an explicit agent replay/checkpoint step — not by blindly
   continuing upstream on the bare `streamText` session unless the product
   documents that risk.

2. **`streamText` scope:** Keep `continueUpstream` as “same logical model turn”
   continuation for **text/tool streaming at the LLM boundary**. If the last
   stored parts imply **open tool calls**, document that callers **must not**
   rely on `continueUpstream` alone for correctness; they should surface state
   to the agent runtime.

3. **Implemented:** Core throws **`ContinueUpstreamMidToolCallError`** when unsafe (see §3 in RFC 0017). **`@ziro-agent/agent`** re-exports **`tailBlocksContinueUpstream`**, **`isContinueUpstreamMidToolCallError`**, and **`MID_TOOL_CALL_CONTINUE_UPSTREAM_HINT`** so hosts branch to **`agent.resume`** / **`resumeFromCheckpoint`** ([RFC 0002](./0002-human-in-the-loop.md)) instead of retrying bare `continueUpstream`. Full product UI flows remain out of repo.

## Non-goals (this RFC)

- Provider-native response IDs as the primary continuation mechanism (already a
  non-goal of RFC 0017).

## Adoption

Merge this design into Phase F row of RFC 0017 when implementation tickets are
opened; close Phase F only after shipped behaviour matches this split between
**streamText** and **agent loop**.
