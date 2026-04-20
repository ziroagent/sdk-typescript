/**
 * Commitlint config — enforces Conventional Commits across this repo.
 *
 * Lives at the repo root (not under .github) because:
 *   1. wagoid/commitlint-github-action looks here by default
 *   2. local pre-commit hooks (husky/lefthook) also look here
 *
 * Versioning rule encoded in `scripts/validate-changeset.ts`:
 *   feat       → minor
 *   fix / perf → patch
 *   feat!  / "BREAKING CHANGE:" footer → MAJOR (strict pre-1.0)
 *   chore, docs, ci, build, test, refactor, style, revert → no release
 *
 * @see CONTRIBUTING.md > "Versioning policy" for the full table.
 */

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  // We deliberately ignore commits made by bots — changesets/release/sync
  // bots produce well-formed conventional commits already, and tightening
  // here would only catch our own automation.
  ignores: [
    (msg) => /^chore\(release\): version packages/i.test(msg),
    (msg) => /^chore\(sync\): main -> dev/i.test(msg),
    (msg) => /^chore\(deps(-dev)?\)/i.test(msg) && /\bdependabot\[bot\]\b/i.test(msg),
    (msg) => /Signed-off-by: dependabot\[bot\]/i.test(msg),
  ],
  rules: {
    // Allowed types — kept in lock-step with `RELEASE_TYPES` and
    // `NON_RELEASE_TYPES` in scripts/validate-changeset.ts. Update both
    // together or the gate will silently mismatch.
    'type-enum': [
      2,
      'always',
      [
        // release-bumping
        'feat', // → minor
        'fix', // → patch
        'perf', // → patch
        // non-release (no changeset required)
        'chore',
        'docs',
        'ci',
        'build',
        'test',
        'refactor',
        'style',
        'revert',
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // Scope is OPTIONAL but if present must match a known package name
    // (without the `@ziro-agent/` prefix) or one of the special scopes.
    // Keep this list current with `pnpm-workspace.yaml` packages/.
    'scope-enum': [
      2,
      'always',
      [
        // packages/*
        'core',
        'agent',
        'tools',
        'workflow',
        'memory',
        'middleware',
        'tracing',
        'eval',
        'cli',
        'providers-openai',
        'providers-anthropic',
        'providers-google',
        'providers-ollama',
        'checkpoint-memory',
        'checkpoint-postgres',
        'checkpoint-redis',
        'inngest',
        // apps/*
        'docs',
        'playground',
        // examples/*
        'examples',
        // cross-cutting
        'ci', // CI / CD config touching multiple workflows
        'deps',
        'release',
        'repo',
        'rfc',
        'security',
        'pricing',
        'hitl',
        'lint', // formatter / linter / biome config
        'workflows', // synonym for ci, used in some legacy commits
      ],
    ],
    'scope-case': [2, 'always', 'kebab-case'],

    // Subject rules — keep messages skimmable in `git log --oneline`
    // and changelog rendering.
    'subject-empty': [2, 'never'],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 100],

    // Header (`<type>(<scope>): <subject>`) total length cap.
    'header-max-length': [2, 'always', 120],

    // Footer wrapping for long bodies (BREAKING CHANGE block, etc.).
    // `footer-leading-blank` is demoted from error -> warn because
    // `git commit -s -s` (or co-author sign-offs from multiple machines)
    // appends extra `Signed-off-by:` trailers without a blank line, and
    // failing CI on that is more annoying than helpful.
    'body-leading-blank': [2, 'always'],
    'body-max-line-length': [1, 'always', 200],
    'footer-leading-blank': [1, 'always'],
    'footer-max-line-length': [1, 'always', 200],

    // Sign-off (DCO) is required by CONTRIBUTING.md. Bot commits are
    // exempted via the `ignores` block above. We check it as a WARN at
    // commitlint level (level 1) so a missing trailer doesn't block the
    // PR purely on commitlint — the dedicated DCO bot is the source of
    // truth for the merge gate.
    'signed-off-by': [1, 'always', 'Signed-off-by:'],
  },
};
