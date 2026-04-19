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

Housekeeping release — no runtime changes.

This release exists to (1) consume the GitHub Actions major bumps that
silence the "Node.js 20 actions are deprecated" annotation, and (2)
exercise the CI release path end-to-end after the publish-auth fix
landed in `62bc4d7` (which v0.1.2 had to be published locally to bypass).

- **CI publish auth fix validated.** `actions/setup-node`'s
  `registry-url` was setting `NPM_CONFIG_USERCONFIG` to a placeholder-
  containing `.npmrc` that shadowed the `~/.npmrc` written by
  `changesets/action`. Removing `registry-url` makes
  `changesets/action` the single owner of the auth file. v0.1.3 is the
  first version to actually go through the resulting CI publish path.
- **GitHub Actions on Node.js 24-ready majors.** Bumped
  `actions/checkout`, `actions/setup-node`, and `pnpm/action-setup`
  to `v6` across `ci.yml` and `release.yml` (PRs #1, #2, #3).
- **`RELEASE_NOTES.md` restructured** as multi-version notes with
  v0.1.1 / v0.1.2 / v0.1.3 entries added in reverse-chronological
  order.

No source under `packages/*/src/**` was touched. All published
JavaScript and `.d.ts` artifacts are byte-identical to v0.1.2 modulo
the version bump in each `package.json`.
