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

| Type | Use for |
| --- | --- |
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Tooling, build, CI |
| `breaking` | Breaking change (also use `!` after type) |

Scope should be the package name without the `@ziro-agent/` prefix, e.g. `feat(core): ...`, `fix(agent): ...`.

## Changesets

Every PR that affects a published package must include a changeset:

```bash
pnpm changeset
```

Pick the affected package(s), the bump type (patch/minor/major), and write a short user-facing summary. The generated `.md` file goes into `.changeset/` and is committed with your PR.

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
