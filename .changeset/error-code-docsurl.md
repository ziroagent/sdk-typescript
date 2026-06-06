---
'@ziro-agent/core': minor
'@ziro-agent/agent': minor
'@ziro-agent/middleware': patch
'@ziro-agent/inngest': patch
---

RC stabilization (R1): every SDK error now carries a stable `code` and a `docsUrl`.

- `ZiroError` gained a `docsUrl` (defaults to `${ERROR_DOCS_BASE}/${code}`, overridable). New `ERROR_DOCS_BASE` export.
- The previously plain-`Error` classes now extend `ZiroError` with a `code` + `docsUrl` and are `isZiroError`-detectable: `AgentSuspendedError` (`agent_suspended`), `HandoffLoopError` (`handoff_loop`), `ReplayMismatchError` (`replay_mismatch`), `ReplayExhaustedError` (`replay_exhausted`), `ResumableStreamError` / `ContinueUpstreamMidToolCallError`. `instanceof` and existing brands keep working.
- `PromptInjectionError` (`@ziro-agent/middleware`) and `InngestAgentSuspendedError` (`@ziro-agent/inngest`) gained `docsUrl` (kept as plain `Error` to preserve their thin dependency trees).
- `@ziro-agent/core`'s public surface is now declared with explicit named exports instead of 14 `export *` wildcards — same surface, but new internal helpers no longer leak into the public API automatically.
