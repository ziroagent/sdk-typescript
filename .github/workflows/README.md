# GitHub workflows — overview

This directory contains every CI/CD, security, and automation workflow
for the SDK. Workflows are split into three layers so the same logic
isn't duplicated and the security posture stays auditable:

```
┌──────────────────────────────────────────────────────────────────┐
│  CALLERS (trigger-aware orchestrators)                           │
│  ci.yml ─────────────┐                                           │
│  release.yml ────────┼──► _validate.yml (workflow_call)          │
│  nightly.yml ────────┘                                           │
│                                                                  │
│  snapshot.yml, auto-merge-release.yml, sync-main-to-dev.yml,     │
│  changeset-status.yml, pricing-drift.yml                         │
│  └─ standalone: own triggers, share `_setup-pnpm-node` composite │
│                                                                  │
│  codeql.yml, scorecard.yml, osv-scanner.yml                      │
│  └─ security scanners: SARIF → Security tab                      │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  REUSABLE LOGIC                                                  │
│  _validate.yml          (lint + matrix build/test + publint+attw)│
│  ../actions/setup-pnpm-node/action.yml  (composite: pnpm + node) │
└──────────────────────────────────────────────────────────────────┘
```

## Workflow index

| File | Trigger | Purpose | Required-status? |
| ---- | ------- | ------- | ---------------- |
| `_validate.yml`            | `workflow_call`                          | Reusable validation suite — lint + matrix build/test/typecheck + publint + attw + coverage + examples typecheck | n/a (reusable) |
| `ci.yml`                   | push / PR `main`                         | PR gate; calls `_validate` with PR-trimmed matrix (1 OS × 2 Node) + coverage upload | ✅ `Validate / Validation summary` |
| `release.yml`              | push `main`                              | Pre-release gate (full matrix via `_validate`) → changesets version PR or publish | ❌ |
| `auto-merge-release.yml`   | PR `main` (open/synchronize/...)         | Enables GitHub native auto-merge on the changesets version PR | ❌ |
| `snapshot.yml`             | PR labeled `release:snapshot`            | Publishes ephemeral preview to npm dist-tag `pr-<n>` (auth: maintainer permission gate) | ❌ |
| `changeset-status.yml`     | PR `main`                                | **Hard gate**: commitlint (Conventional Commits) + changeset bump matches PR type (feat→minor, fix/perf→patch, breaking→major). Bypass via label `skip-changeset-gate`. | ✅ `Lint commits + PR title`, `Validate changeset bump` |
| `sync-main-to-dev.yml`     | push `main` / dispatch                   | Fast-forward `dev` to `main`, or open back-merge PR if diverged | ❌ |
| `pricing-drift.yml`        | cron Mon / PR pricing data / dispatch    | Open / refresh tracking issue when LLM pricing entries are stale | ❌ |
| `nightly.yml`              | cron 04:30 UTC daily / dispatch          | Full 3 OS × 2 Node matrix + provider integration + signature audit + outdated report | ❌ |
| `codeql.yml`               | push / PR / cron Sun                     | Static analysis (security-and-quality query suite) → Security tab | ✅ recommended |
| `scorecard.yml`            | push `main` / cron Tue / branch-protection-rule | OpenSSF Scorecard → Security tab + public Scorecard API badge | ❌ |
| `osv-scanner.yml`          | push / PR / cron Mon                     | OSV.dev vulnerability scan → Security tab | ✅ recommended |

## Security model (defense in depth)

Every workflow follows the same hardening playbook:

1. **Top-level `permissions: contents: read`** — explicit denial of any
   write capability. Jobs that need more (`contents: write` for tags,
   `id-token: write` for OIDC, `security-events: write` for SARIF, etc.)
   escalate **only** at the job level, never workflow-wide.
2. **`step-security/harden-runner`** as the first step of every job.
   Runs in `audit` mode (logs unexpected egress to the run summary)
   so we can build the allowlist incrementally before flipping to `block`.
3. **All actions pinned by 40-char commit SHA** with a `# vX.Y` trailing
   comment. Dependabot bumps both atomically. No `@v3` / `@main` allowed.
4. **`persist-credentials: false` on every checkout** that doesn't
   actually need to push back. Stops a downstream step from accidentally
   inheriting GITHUB_TOKEN write access.
5. **Token never echoed to shell.** `printf` over `echo` for any string
   containing a secret; tokens consumed via `env:` only, never via
   `with:` (where they'd appear in the run log).
6. **Label-triggered workflows verify actor permission** before doing
   anything (see `snapshot.yml authorize` job). Defends against
   `triage`-permission-only attackers gaming label triggers.
7. **PR-target workflows verify `head.repo == base.repo`** before
   acting on bot PRs (see `auto-merge-release.yml`).
8. **Concurrency policies**:
   - CI / scan workflows: `cancel-in-progress: true` (no side effects).
   - Publish workflows (release, sync): `cancel-in-progress: false`
     (interrupting mid-publish corrupts the registry).

## Performance levers

| Lever | Where | Impact |
| ----- | ----- | ------ |
| Smart matrix (PR: 1×2, nightly: 3×2) | `ci.yml` vs `nightly.yml` | ~60% saving in PR runner-minutes |
| `dist/` artifact reuse across jobs | `_validate.yml` | ~3 min saved on `package-quality` per run |
| Turbo Remote Cache | `_validate.yml` env `TURBO_TOKEN` / `TURBO_TEAM` | Cold build 90s → cache hit 5s. Set `TURBO_TOKEN` secret + `TURBO_TEAM` repo var to enable |
| Composite setup action | `.github/actions/setup-pnpm-node` | ~10s saved per job (no re-resolution of pnpm version) |
| `concurrency cancel-in-progress` | every CI/scan workflow | Saves the cost of N stale runs when a contributor force-pushes a PR rapidly |

## Required repo configuration

These settings must be enabled **once** per repo. The workflows assume
they are present and degrade gracefully (with a clear error) when they
aren't.

### Branch protection (`Settings → Branches → main`)

- ✅ Require a pull request before merging
- ✅ Require status checks to pass:
  - `Validate / Validation summary` (the aggregate from `_validate.yml`)
  - `Lint commits + PR title` (commitlint — enforces Conventional Commits)
  - `Validate changeset bump` (enforces feat→minor / fix→patch / breaking→major)
  - `Analyze (javascript-typescript)` (CodeQL — recommended)
  - `Vulnerability scan` (OSV — recommended)
- ✅ Require branches to be up to date before merging (recommended)
- ✅ Require signed commits (recommended; complements DCO)
- ✅ Include administrators (so bot PRs go through the same gate)
- ✅ Restrict who can push to matching branches: only release bot

### General (`Settings → General → Pull Requests`)

- ✅ Allow auto-merge
- ✅ Allow squash merging
- ⚠️ Disable merge commits + rebase merging (optional — keeps history flat)
- ✅ Automatically delete head branches (cleans up `changeset-release/main` etc.)

### Secrets / variables

| Name | Type | Required? | Used by |
| ---- | ---- | --------- | ------- |
| `NPM_TOKEN`            | secret | Yes (until Trusted Publishers migration) | `release.yml`, `snapshot.yml` |
| `GITHUB_TOKEN`         | auto   | Auto-provided                             | every workflow |
| `CODECOV_TOKEN`        | secret | Optional                                  | `_validate.yml` (coverage upload) |
| `TURBO_TOKEN`          | secret | Optional                                  | `_validate.yml` (Remote Cache) |
| `TURBO_TEAM`           | var    | Optional                                  | `_validate.yml` (Remote Cache) |
| `OPENAI_API_KEY`       | secret | Optional                                  | `nightly.yml` (integration) |
| `ANTHROPIC_API_KEY`    | secret | Optional                                  | `nightly.yml` (integration) |
| `GOOGLE_API_KEY`       | secret | Optional                                  | `nightly.yml` (integration) |
| `OLLAMA_HOST`          | secret | Optional                                  | `nightly.yml` (integration) |
| `RELEASE_BOT_TOKEN` *or* `RELEASE_APP_ID` + `RELEASE_APP_PRIVATE_KEY` | secret | Recommended | `release.yml` (fixes CI cascade — see `RELEASING.md`) |

## Adding a new workflow — checklist

When you add a new `*.yml` here, copy the hardening template:

```yaml
name: <Name>

on:
  # ...

# Always: top-level read-only.
permissions:
  contents: read

env:
  TURBO_TELEMETRY_DISABLED: 1

jobs:
  <job>:
    runs-on: ubuntu-latest
    timeout-minutes: <N>           # ALWAYS set a timeout
    permissions:
      contents: read               # escalate per-job only
    steps:
      - name: Harden runner
        uses: step-security/harden-runner@<SHA> # v2
        with:
          egress-policy: audit
      - uses: actions/checkout@<SHA>  # v6
        with:
          persist-credentials: false  # unless this job actually pushes
      - uses: ./.github/actions/setup-pnpm-node  # if you need pnpm/node
      # ...
```

If you copy from an existing workflow, run through `_validate.yml`
once locally with [`act`](https://github.com/nektos/act) before merging:

```bash
act pull_request -W .github/workflows/_validate.yml --container-architecture linux/amd64
```
