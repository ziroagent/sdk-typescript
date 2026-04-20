# Contributing to ZiroAgent SDK

Thanks for your interest in contributing! This document explains how to set up the project, our conventions, and the review process.

## Code of Conduct

This project adheres to the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## Getting started

### Prerequisites

- Node.js ≥ 20.10 (use `.nvmrc` — `nvm use`)
- pnpm ≥ 10
- Git

### Setup

```bash
git clone https://github.com/ziroagent/sdk-typescript.git
cd sdk
pnpm install
pnpm build
pnpm test
```

### Useful commands

```bash
pnpm build          # build every package via Turborepo
pnpm dev            # watch mode
pnpm test           # run all vitest suites
pnpm lint           # biome check (lint + format check)
pnpm lint:fix       # auto-fix lint + format
pnpm typecheck      # tsc --noEmit per package
pnpm changeset      # create a changeset for your PR
```

## Workflow

1. Fork the repo and create a feature branch from `main`.
2. Make your change. Add or update tests.
3. Run `pnpm lint && pnpm typecheck && pnpm test` locally.
4. Run `pnpm changeset` to describe your change for the changelog.
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat(core): add streamText`).
6. Sign off your commits (DCO, see below): `git commit -s`.
7. Open a PR. Fill out the template. CI must be green.

## Developer Certificate of Origin (DCO)

We use [DCO](https://developercertificate.org/) instead of a CLA. Every commit must include a `Signed-off-by` trailer:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use `git commit -s` to add it automatically.

## Conventional Commits

We **enforce** Conventional Commits via `commitlint` in CI (see
`commitlint.config.cjs` for the full rule set). The check runs on every
commit in the PR **and** on the PR title itself, because we squash-merge
and the PR title becomes the `main`-branch commit message.

### Allowed types

| Type | Use for | Triggers release? |
| --- | --- | --- |
| `feat` | New feature | ✅ minor bump |
| `fix` | Bug fix | ✅ patch bump |
| `perf` | Performance improvement (no API change) | ✅ patch bump |
| `refactor` | Internal restructure with no behaviour change | ❌ |
| `docs` | Documentation only | ❌ |
| `test` | Adding or updating tests | ❌ |
| `chore` | Tooling, build, deps | ❌ |
| `ci` | CI/CD config | ❌ |
| `build` | Build system / external deps | ❌ |
| `style` | Formatting only (no logic change) | ❌ |
| `revert` | Revert of a previous commit | ❌ |

### Breaking changes

A breaking change is signalled by `!` after the type/scope **or** a
`BREAKING CHANGE:` footer in the body:

```text
feat(core)!: rename `runAgent` to `runAgentStream`

BREAKING CHANGE: `runAgent` is removed. Migration: rename all imports
and update the result handler — see RFC 0008 § Migration.
```

### Scope

Scope is **optional** but if present must match a known package or
cross-cutting topic. The full list is enforced by `commitlint.config.cjs`
under `scope-enum`. Examples: `core`, `agent`, `providers-google`,
`checkpoint-postgres`, `cli`, `docs`, `playground`, `deps`, `release`,
`security`, `pricing`.

## Versioning policy

| PR commit | Required changeset bump | Notes |
| --- | --- | --- |
| `feat:` / `feat(scope):` | `minor` | Adds public API surface |
| `fix:` / `perf:` | `patch` | No API change, behaviour fix |
| `feat!:` / `feat(scope)!:` / `BREAKING CHANGE:` footer | `major` | **Strict pre-1.0**: we still bump major even though SemVer 0.x technically permits breaking at minor. Reason: it makes the eventual 1.0 cutover trivial — no policy switch, no consumer surprise. |
| `chore`, `docs`, `ci`, `build`, `test`, `refactor`, `style`, `revert` | _none_ | Changeset optional. If you include one anyway, that's fine. |

CI enforces this via `scripts/validate-changeset.ts` running in the
`Changeset gate` workflow (`.github/workflows/changeset-status.yml`):

- `feat:` PR with no changeset → **CI fail**.
- `feat:` PR with only a `patch` changeset → **CI fail**.
- `fix:` PR with a `minor` changeset → **CI pass** (over-bumping is OK).
- `chore:` PR with no changeset → **CI pass**.
- Breaking PR (`!` or `BREAKING CHANGE:`) without `major` changeset → **CI fail**.

### Bypass (rare)

If you need to bypass the gate (e.g. an emergency revert that doesn't
fit the contract), apply the label `skip-changeset-gate`. The bypass is
logged in the workflow summary and visible to anyone reading the run.
Use sparingly — bypasses are auditable.

## Changesets

Every PR that maps to a release-bumping commit type (`feat`, `fix`,
`perf`) **must** include a changeset:

```bash
pnpm changeset
```

Pick the affected package(s), the bump type (`patch`/`minor`/`major`),
and write a short user-facing summary. The generated `.md` file goes
into `.changeset/` and is committed with your PR.

Conventions:

- Imperative mood: "Add X", "Fix Y", "Deprecate Z".
- Mention the public API surface that changed, not the internal refactor.
- For `major`, add a "Migration:" section. The richer the better — these
  end up verbatim in the GitHub Release body.

If your PR is a non-release type (`chore`, `docs`, etc.), the gate
allows you to skip the changeset entirely.

## RFC process for large changes

For non-trivial API changes, propose an RFC first:

1. Open an issue with the `rfc` label and a short pitch.
2. If maintainers say "go", open a PR adding `rfcs/NNNN-title.md`.
3. Discuss in the PR until consensus is reached.
4. Merged RFC = green light to implement.

## Code style

- Biome formats and lints. Run `pnpm lint:fix` before pushing.
- TypeScript strict mode is non-negotiable.
- Prefer `import type { ... }` for type-only imports.
- No `any` without a `// biome-ignore lint/suspicious/noExplicitAny: <reason>` comment.

## Tests

- Unit tests live next to the source: `foo.ts` ↔ `foo.test.ts`.
- Integration tests live in `__tests__/integration/` per package.
- HTTP-based tests use `msw` for deterministic mocking.
- Aim for ≥ 80% coverage on new code.

## Reporting bugs

Use the bug template. Include:

- Package and version.
- Minimal reproduction (CodeSandbox / StackBlitz / repo).
- Expected vs actual behaviour.
- Node version and OS.

## Security

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the [Apache License 2.0](LICENSE).
