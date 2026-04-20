# Releasing

This monorepo uses [Changesets](https://github.com/changesets/changesets) +
[`changesets/action`](https://github.com/changesets/action) to ship every
public package on a single, fully-automated pipeline.

There is **no manual `npm publish` step**. If you find yourself reaching for
one, stop and read this file first.

---

## TL;DR — the happy path

```text
contributor opens PR
   └─ adds a changeset:        pnpm changeset
   └─ CI runs (lint+test+build+publint+attw)
   └─ "Changeset status" workflow nudges if missing
maintainer merges PR to main
   └─ Release workflow re-runs the full gate on `main`
   └─ Opens (or updates) "chore(release): version packages" PR
maintainer merges the version PR
   └─ Release workflow runs again
   └─ Publishes every bumped package to npm
   └─ Creates a GitHub Release per package, tagged `<name>@<version>`
   └─ Pushes git tags
```

End-to-end latency from "merge version PR" to "available on npm" is ~3 min.

---

## Workflows

| File                                             | Trigger                              | What it does                                                                                                |
| ------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                       | push/PR to `main`                    | Lint + matrix build/test/typecheck + publint + attw                                                         |
| `.github/workflows/changeset-status.yml`         | PR                                   | Soft warning if PR touches `packages/*` without a changeset                                                 |
| `.github/workflows/release.yml`                  | push to `main`                       | **Gate** (re-runs full CI suite) → opens version PR or publishes + creates GitHub Releases                  |
| `.github/workflows/snapshot.yml`                 | PR labeled `release:snapshot`        | Publishes ephemeral preview build under dist-tag `pr-<number>`; comments install instructions on the PR    |
| `.github/workflows/pricing-drift.yml`            | scheduled                            | Detects unverified pricing entries (unrelated to publishing)                                                |

---

## Adding a changeset

```bash
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a
**user-facing** summary (it lands directly in `CHANGELOG.md` and the GitHub
Release body). Commit the generated `.changeset/*.md` file with your code.

Conventions:

- Use the imperative mood: "Add X", "Fix Y", "Deprecate Z".
- Mention the public API surface that changed, not the internal refactor.
- For breaking changes (`major`), add a "Migration" section explaining the
  upgrade path. The richer the better — these end up in the GitHub Release.

For a doc-only / infra-only / internal refactor PR, skip the changeset. The
`Changeset status` workflow will warn rather than fail.

---

## Snapshot (preview) releases

Need to test a fix downstream before it lands on `main`?

1. Push your branch and open a PR with a normal changeset.
2. Add the label **`release:snapshot`** to the PR.
3. Wait ~2 min. The `Snapshot release` workflow will:
   - Validate that a changeset exists on the PR.
   - Bump versions to `<base>-pr-<num>-<utc>.<n>` via
     `changeset version --snapshot pr-<num>`.
   - Publish to npm under dist-tag `pr-<num>`.
   - Comment on the PR with install instructions.
4. Each subsequent push to the PR re-publishes; the `pr-<num>` dist-tag
   always points at the latest snapshot.

Snapshots are **never** promoted to `latest` and are safe to abandon — they
do not consume the PR's changeset (`--snapshot` mode skips changeset
deletion).

---

## Manual ops

### Re-publishing a missed package

If `release.yml` raced with a registry hiccup and one package failed to
publish (the rest succeeded), the safest recovery is:

```bash
git checkout main
git pull --tags
pnpm install --frozen-lockfile
pnpm --filter @ziro-agent/<name> build
cd packages/<name>
npm publish --access public
```

Do **not** run `pnpm release` locally on `main` — it will try to consume
already-consumed changesets and may bump versions twice.

### Hotfix release without going through CI

Don't. Open a PR with the changeset, get it through the gate, and let the
pipeline run. The 3-minute round-trip is the price of having a single
auditable publish path.

---

## Enabling provenance

[npm provenance](https://docs.npmjs.com/generating-provenance-statements)
attaches a sigstore attestation linking each tarball to the exact GitHub
Actions run + commit that produced it. We currently **disable** it via
`NPM_CONFIG_PROVENANCE: "false"` because the active automation token is a
classic token; enabling provenance under it returns 404 from the npm PUT.

Migration path (do this when we get a maintainer with package-admin rights):

1. In the [npm web UI](https://www.npmjs.com/), open each package's
   **Settings → Trusted publishers** and bind:
   - Repository: `ziroagent/sdk-typescript`
   - Workflow: `release.yml`
   - Environment: *(leave blank)*
2. Once **all** published packages are bound, remove the `NPM_TOKEN` repo
   secret. (Trusted publishing replaces token auth entirely.)
3. In `.github/workflows/release.yml`:
   - Delete the `Configure npm auth + verify` step.
   - Set `NPM_CONFIG_PROVENANCE: "true"`.
   - Drop `NPM_TOKEN` from the `env:` block of the changesets step.
4. Repeat steps 1–3 for `snapshot.yml` (snapshots also benefit from
   provenance).
5. Trigger a no-op patch release end-to-end and verify provenance shows up
   on npmjs.com under each package's "Provenance" tab.

---

## Rotating `NPM_TOKEN` (until trusted publishers ships)

1. Generate a new automation token at npmjs.com → Profile → Access Tokens →
   "Generate New Token" → "Automation".
2. In GitHub: **Settings → Secrets → Actions → `NPM_TOKEN` → Update**.
3. Re-run the most recent failed `Release` workflow if applicable.
4. Revoke the old token from npmjs.com.

The release workflow's first step (`Configure npm auth + verify`) will fail
fast with a clear error if the token is missing or rejected — no silent
half-publishes.

---

## Disaster recovery

| Symptom                                      | Likely cause                                                         | Fix                                                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Version PR not opening                       | No changeset files, or all changesets target ignored packages        | Run `pnpm changeset status` locally; add a changeset                                                                      |
| Publish fails with `404 Not Found`           | Bad token / wrong scope / unpublished package name                   | Re-run the `Configure npm auth` step locally with the same token; check package access on npmjs.com                       |
| Publish fails with `403 Forbidden`           | Token lacks publish rights for that package                          | Add the bot user to the package on npmjs.com, or rotate to a token with broader scope                                     |
| Half the packages published, half didn't     | Network blip mid-publish (rare but possible)                         | Re-run the workflow — `changeset publish` is idempotent and skips already-published versions                              |
| GitHub Release missing for a published pkg   | `createGithubReleases` raced with API; CHANGELOG.md is still correct | Manually create the release pointing at the existing tag, copy/paste the CHANGELOG.md entry                               |
| Snapshot dist-tag stuck on stale build       | PR closed without merging                                            | `npm dist-tag rm @ziro-agent/<pkg> pr-<num>` (or just ignore — nothing reads abandoned dist-tags)                         |

---

## Adding a new public package

1. Create the package under `packages/<name>/` following the
   `packages/agent/` template (matching `tsup.config.ts`, `tsconfig.json`,
   `vitest.config.ts`, `package.json` `exports`, `files`, `sideEffects`,
   `publishConfig.access: "public"`).
2. Make sure `pnpm --filter @ziro-agent/<name> publint && pnpm --filter @ziro-agent/<name> attw`
   pass locally.
3. Add a changeset bumping the new package from `0.0.0` → `0.x.0`.
4. The first time the release workflow publishes it, npm will create the
   package under the `@ziro-agent` org. Make sure the bot user has publish
   rights on the org (you should only need to do this once, not per
   package).

---

## What we deliberately do **not** automate

- **Cross-publishing to JSR / Deno.** Out of scope until v0.3.
- **Auto-merging the version PR.** A human must approve so release notes
  get a sanity-check before they hit users.
- **Regenerating `apps/docs` on every release.** Docs deploy independently
  via Vercel on push to `main` (or whatever provider we settle on). The
  release pipeline never blocks on a docs build.
