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
   └─ Auto-merge workflow enables GitHub native auto-merge on that PR
   └─ CI passes on the PR → GitHub auto-merges into main
       └─ (no human click required — see "Auto-publish" section below)
   └─ Release workflow runs again on the merge commit
   └─ Publishes every bumped package to npm
   └─ Creates a GitHub Release per package, tagged `<name>@<version>`
   └─ Pushes git tags
```

End-to-end latency from "merge feature PR" to "available on npm" is
typically 8–12 minutes (gate → version PR → CI on version PR →
auto-merge → publish), with no human intervention after the initial
feature merge.

---

## Workflows

| File                                             | Trigger                              | What it does                                                                                                |
| ------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                       | push/PR to `main`                    | Lint + matrix build/test/typecheck + publint + attw                                                         |
| `.github/workflows/changeset-status.yml`         | PR                                   | Soft warning if PR touches `packages/*` without a changeset                                                 |
| `.github/workflows/release.yml`                  | push to `main`                       | **Gate** (re-runs full CI suite) → opens version PR or publishes + creates GitHub Releases                  |
| `.github/workflows/auto-merge-release.yml`       | PR opened/updated                    | Detects the changesets `chore(release): version packages` PR and enables GitHub native auto-merge on it     |
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

## Auto-publish (zero-touch releases)

The `auto-merge-release.yml` workflow turns the changesets PR into a
zero-touch hop: once `release.yml` opens or updates
`chore(release): version packages`, GitHub native auto-merge is enabled
on it. The PR merges itself the moment branch-protection checks go
green, and `release.yml` immediately publishes on the resulting merge
commit.

### Required repository settings

Both must be enabled exactly once per repository — `gh pr merge --auto`
silently fails (returns "Auto-merge is not allowed for this repository")
without them.

1. **Settings → General → Pull Requests** — enable
   **"Allow auto-merge"** and **"Allow squash merging"**.
2. **Settings → Branches → Branch protection rule for `main`**:
   - **Require a pull request before merging** ✅
   - **Require status checks to pass before merging** ✅
     - Add: `Lint & format`, `Build & test (ubuntu-latest / Node 20)`,
       `Build & test (ubuntu-latest / Node 22)`,
       `Package quality (attw + publint)`
   - **Require branches to be up to date before merging** — optional
     but recommended; auto-merge will rebase as needed.

Without branch protection, GitHub's auto-merge fires immediately on PR
open (the PR is "mergeable" before CI even starts), which defeats the
gating intent. With the checks above, the PR sits open until CI passes
and only then merges.

### How to halt an auto-publish in flight

You have two windows to intervene:

| Window                                  | How to stop it                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Version PR open, CI not yet passed      | Click **"Disable auto-merge"** on the PR (or push an empty commit to `changeset-release/main`)|
| Version PR merged, publish step running | Cancel the `release.yml` run from the Actions tab. Note: any tarball already PUT to npm is final — `npm deprecate` is the only remediation after that. |

If you want to keep auto-merge for some releases but pause it for others
(e.g. before a major version), revoke "Allow auto-merge" in repo
settings or disable the `auto-merge-release.yml` workflow file. Both
take effect immediately and do not require code changes.

### Disabling auto-publish entirely

Two equivalent ways:

- Disable the workflow from the Actions tab (per-repo, reversible).
- Delete or rename `.github/workflows/auto-merge-release.yml`.

The release pipeline reverts cleanly to manual merge of the version PR.

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
