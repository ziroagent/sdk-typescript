# Governance

This document describes how the ZiroAgent SDK project is governed.

## Roles

### Contributors

Anyone who opens an issue, comments on a PR, or submits code. No prior commitment required.

### Maintainers

People with merge rights on the repository. Responsible for:

- Reviewing and merging PRs.
- Triaging issues.
- Cutting releases.
- Upholding the [Code of Conduct](CODE_OF_CONDUCT.md).

A contributor may be invited to become a maintainer after sustained, high-quality contributions (typically 5+ merged non-trivial PRs and active participation in reviews/discussions).

### BDFL (Benevolent Dictator For Life)

Until the project reaches v1.0, final decisions on contentious technical or governance issues rest with the project lead. This model is intentional for early-stage velocity and will transition to a maintainer-vote model after v1.0.

## Decision-making

| Type of change | Process |
| --- | --- |
| Bug fix, docs, internal refactor | 1 maintainer approval |
| New feature in an existing package | 1 maintainer approval + changeset |
| New package or breaking API change | RFC + 2 maintainer approvals |
| Governance change | RFC + BDFL approval (pre-v1.0) |

## RFC process

For non-trivial API changes (new packages, breaking changes, new core abstractions):

1. Open an issue with the `rfc` label and a 1-page pitch.
2. If maintainers green-light it, open a PR adding `rfcs/NNNN-title.md` (template at `rfcs/0000-template.md`).
3. Discuss in the PR until consensus or the BDFL makes a final call.
4. Merged RFC = approval to implement.

## Releases

- Versioning: [Semantic Versioning](https://semver.org/) (semver).
- Tooling: [Changesets](https://github.com/changesets/changesets).
- Cadence: continuous; a "Version Packages" PR is auto-opened by CI whenever new changesets land on `main`.
- Maintainers merge the Version Packages PR to publish.

## Conflict resolution

1. Discuss in the PR or issue.
2. If unresolved, escalate to maintainers via `@ziroagent/maintainers`.
3. If still unresolved, BDFL decides (pre-v1.0) or majority maintainer vote (post-v1.0).

## Trademark

"ZiroAgent SDK" and the Ziro logo are project marks. They may be used to refer to this project but not in a way that suggests endorsement of derived products without permission.
