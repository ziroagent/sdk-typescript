# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) — small markdown files describing changes that should be released.

## Adding a changeset

```bash
pnpm changeset
```

Pick the packages affected, choose the bump type (patch/minor/major), and write a short summary. The file will be committed alongside your PR.

## Releasing

CI runs `changeset version` on `main` to create a "Version Packages" PR. Merging that PR triggers `changeset publish`, which publishes to npm with provenance and creates GitHub Releases.
