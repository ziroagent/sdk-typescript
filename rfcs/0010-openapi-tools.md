# RFC 0010: OpenAPI → tools generator

- Start date: 2026-04-20
- Authors: @ziro-agent/maintainers
- Status: **stub** (detailed design TBD before v0.3 milestone start)
- Affected packages: `@ziro-agent/openapi` (new), `@ziro-agent/tools`
- Parent: [RFC 0008 — Roadmap v3](./0008-roadmap-v3.md) §C (v0.3) and §A row H3

## Summary

Generate `defineTool` instances from an OpenAPI 3.1 spec so any REST API with
a published spec becomes agent-callable in one line. Removes the most common
"yet another tool wrapper" boilerplate cited by design partners.

## Scope

- New package `@ziro-agent/openapi` exposing `toolsFromOpenAPI(spec, options)`.
- Input: spec URL, file path, or in-memory object.
- Output: `Tool[]` typed against the spec's request / response schemas
  (Standard Schema interop per RFC 0008 row A7).
- Auth helpers: bearer, API key (header / query), OAuth2 client-credentials,
  basic.
- Tool-name policy: `${tag}_${operationId}` by default with collision detection.
- Per-operation filters: `include` / `exclude` callbacks; `transform` callback
  to rewrite a tool before emission (rename, mark `requiresApproval`, etc.).
- `mutates: true` heuristic: any non-GET / non-HEAD verb auto-flags (per
  RFC 0008 row C1).

## Non-goals

- Server-side stub generation (consumers should use `openapi-typescript` /
  `orval` for client SDKs; we wrap them, not replace them).
- Live API discovery / introspection of un-spec'd endpoints.
- A registry of "blessed" OpenAPI specs (Stripe, GitHub, etc.) — ship as
  cookbook recipes, not a feature.

## Open questions (defer to detailed design)

- Pick the spec parser dep: `@redocly/openapi-core` vs.
  `@apidevtools/swagger-parser` vs. handwritten subset? Trade-offs: parser
  weight vs. spec coverage.
- Streaming endpoints (SSE / WebSocket) — wrap as tools or skip?
- File upload (multipart) — schema-only first, runtime handling P1?

## Detailed design

TBD before v0.3 milestone start. Owner to draft.
