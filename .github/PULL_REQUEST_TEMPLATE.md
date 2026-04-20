<!-- Thanks for contributing to ZiroAgent SDK! -->

## Summary

<!-- What does this PR do? -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation
- [ ] Refactor / internal
- [ ] CI / tooling

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat(core): ...`, `fix(agent): ...`, `feat(core)!: ...` for breaking) — enforced by `Changeset gate / Lint commits + PR title`
- [ ] I added a changeset (`pnpm changeset`) with a bump matching my commit type — see [Versioning policy](../CONTRIBUTING.md#versioning-policy):
  - [ ] `feat:` → `minor` changeset
  - [ ] `fix:` / `perf:` → `patch` changeset
  - [ ] `feat!:` / `BREAKING CHANGE:` → `major` changeset
  - [ ] non-release type (`chore`/`docs`/`ci`/`build`/`test`/`refactor`/`style`/`revert`) → no changeset required
- [ ] I added or updated tests
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally
- [ ] My commits are signed off (`git commit -s`) per [DCO](../CONTRIBUTING.md#developer-certificate-of-origin-dco)
- [ ] If this is a breaking change or new package, I opened an RFC first

## Related issues / RFCs

<!-- e.g. Closes #123, Implements RFC #045 -->
