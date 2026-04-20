# RFC 0013: Sandbox tools (code interpreter + browser)

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design TBD before v0.7 milestone start)
- Affected packages: `@ziro-agent/sandbox-e2b` (new), `@ziro-agent/browser-playwright` (new), `@ziro-agent/tools`
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.7) and §A rows H4, H5

## Summary

Ship adapter packages for the two most-cited "missing" agent tools in 2026:
**code interpreter** (sandboxed Python / JS execution via E2B / Modal) and
**browser** (Playwright / Browserbase). Both ship as adapters behind a
`SandboxAdapter` / `BrowserAdapter` interface so consumers can swap providers.

## Scope

- `SandboxAdapter` interface: `execute(code, language, options)` →
  `{ stdout, stderr, exitCode, files }`.
- `@ziro-agent/sandbox-e2b` reference adapter wrapping the E2B SDK; ships
  with `codeInterpreter()` tool factory that an agent can `defineTool`-style
  receive.
- `BrowserAdapter` interface: page primitive (`goto`, `click`, `type`,
  `screenshot`, `evaluate`).
- `@ziro-agent/browser-playwright` reference adapter wrapping Playwright
  directly; ships with low-level page tools + a high-level `browse(url, intent)`
  tool that drives an agent loop over the page.
- Capability declaration for marketplace forward-compat: every sandbox tool
  declares `capabilities: ['network', 'fs:read:/tmp', 'fs:write:/tmp']`.
- HITL integration: code execution and navigation are `mutates: true` by
  default, auto-`requiresApproval`.
- Tracing: `ziro.sandbox.execute` and `ziro.browser.action` spans.

## Non-goals

- In-process Node VM as the default sandbox — kernel isolation is required;
  `vm` module is unsafe for untrusted code.
- A general "computer use" model wrapper (Anthropic Computer Use, OpenAI
  Operator) — that's a multi-modal model surface, covered by RFC 0014 +
  cookbook recipes.
- Reimplementing Stagehand's NL-to-action layer — keep low-level page
  primitive, ship cookbook for high-level wrappers.

## Open questions (defer to detailed design)

- Should sandbox `files` IO use the upcoming `file` content part (RFC 0014)
  or a separate `FileHandle` type?
- Browser session persistence (cookies / auth) — opaque adapter detail or
  first-class API?
- Default `requiresApproval` policy: per-tool (most invasive) or per-session
  (most ergonomic)?

## Detailed design

TBD before v0.7 milestone start. Owner to draft.
