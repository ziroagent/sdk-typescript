---
"@ziro-agent/core": patch
"@ziro-agent/openai": patch
"@ziro-agent/anthropic": patch
"@ziro-agent/tools": patch
"@ziro-agent/agent": patch
"@ziro-agent/memory": patch
"@ziro-agent/workflow": patch
"@ziro-agent/tracing": patch
"@ziro-agent/cli": patch
---

Improve dual ESM/CJS type resolution.

`exports['.']` (and the `./mcp` / `./pgvector` subpath exports) now declare
separate `import.types` and `require.types` conditions — `.d.ts` is served to
ESM consumers and `.d.cts` to CJS consumers. This eliminates the
`@arethetypeswrong/cli` `FalseESM` warnings that v0.1.1 still produced and
makes `moduleResolution: "node16" / "nodenext" / "bundler"` consumers see the
correct type files for their runtime.

Also:
- `attw` scripts pinned to `--profile=node16` so legacy `node10` resolution
  stays informational (subpath exports require `node16+` resolution).
- `publint` and `attw` now pass cleanly for all nine published packages.
- No runtime behaviour change.
