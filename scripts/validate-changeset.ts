#!/usr/bin/env -S node --experimental-strip-types
/**
 * Changeset gate — runs in CI on every PR to `main`.
 *
 * Enforces the versioning policy declared in CONTRIBUTING.md:
 *   feat       → requires a `minor` (or higher) changeset
 *   fix / perf → requires a `patch` (or higher) changeset
 *   feat!  / "BREAKING CHANGE:" footer → requires a `major` changeset
 *                                        (strict pre-1.0 — see policy)
 *   chore, docs, ci, build, test, refactor, style, revert → no changeset
 *
 * Inputs:
 *   - PR title and body via $GITHUB_EVENT_PATH (set by GH Actions on
 *     `pull_request` events). Outside of CI, you can set PR_TITLE and
 *     optional PR_BODY env vars to dry-run locally.
 *   - Changesets via `.changeset/*.md` (skipping README.md and config.json).
 *
 * Exit codes:
 *   0 — policy satisfied (or PR is non-release type and no changeset).
 *   1 — policy violation (missing changeset, wrong bump type, etc.).
 *   2 — script error (malformed input, can't read changesets, etc.).
 *
 * Why a custom script (vs `changeset status`):
 *   `changeset status` only tells us WHICH packages would be released
 *   and at what bump — it does NOT validate that the bump matches the
 *   conventional-commit type of the PR. We layer that semantic check
 *   on top: getting `feat:` PRs through with only a `patch` changeset
 *   would leak features into patch releases and break consumer SemVer
 *   expectations.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Type / scope tables — KEEP IN SYNC WITH commitlint.config.cjs.
// ---------------------------------------------------------------------------

/** Conventional Commit types that imply a release. */
const RELEASE_TYPES = new Set(['feat', 'fix', 'perf']);

/** Conventional Commit types that DO NOT require a changeset. */
const NON_RELEASE_TYPES = new Set([
  'chore',
  'docs',
  'ci',
  'build',
  'test',
  'refactor',
  'style',
  'revert',
]);

type Bump = 'major' | 'minor' | 'patch';

const BUMP_RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };

/**
 * Map a conventional commit type (after extracting `!` for breaking) to
 * the MINIMUM acceptable changeset bump.
 *
 * Pre-1.0 policy choice: breaking → MAJOR (strict). Once any package
 * crosses 1.0, this matches strict SemVer for that package too.
 */
function expectedBump(type: string, isBreaking: boolean): Bump | null {
  if (isBreaking) return 'major';
  if (type === 'feat') return 'minor';
  if (type === 'fix' || type === 'perf') return 'patch';
  return null; // non-release type
}

// ---------------------------------------------------------------------------
// PR header parsing.
// ---------------------------------------------------------------------------

interface ParsedHeader {
  type: string;
  scope: string | null;
  isBreaking: boolean;
  subject: string;
}

/**
 * Parse a Conventional Commit header. Accepts:
 *   feat: subject
 *   feat(scope): subject
 *   feat!: breaking subject
 *   feat(scope)!: breaking subject
 */
function parseHeader(header: string): ParsedHeader | null {
  const m = header.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/);
  if (!m) return null;
  return {
    type: m[1].toLowerCase(),
    scope: m[2] ?? null,
    isBreaking: m[3] === '!',
    subject: m[4],
  };
}

/** A `BREAKING CHANGE:` footer in the PR body also implies major. */
function bodyDeclaresBreaking(body: string): boolean {
  return /^BREAKING[ -]CHANGE:/m.test(body);
}

// ---------------------------------------------------------------------------
// Changeset parsing — read .changeset/*.md frontmatter without bringing
// in a YAML dep. The format is stable and trivial.
// ---------------------------------------------------------------------------

interface ParsedChangeset {
  file: string;
  bumps: Map<string, Bump>;
  summary: string;
}

function parseChangesetFile(file: string): ParsedChangeset | null {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!m) return null;
  const frontmatter = m[1];
  const summary = m[2].trim();
  const bumps = new Map<string, Bump>();
  for (const line of frontmatter.split(/\r?\n/)) {
    const lm = line.match(/^\s*['"]?([@\w/-]+)['"]?\s*:\s*['"]?(major|minor|patch)['"]?\s*$/);
    if (lm) bumps.set(lm[1], lm[2] as Bump);
  }
  return { file, bumps, summary };
}

function readChangesets(repoRoot: string): ParsedChangeset[] {
  const dir = join(repoRoot, '.changeset');
  if (!existsSync(dir)) return [];
  const out: ParsedChangeset[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    if (entry.toLowerCase() === 'readme.md') continue;
    const full = join(dir, entry);
    if (!statSync(full).isFile()) continue;
    const parsed = parseChangesetFile(full);
    if (parsed && parsed.bumps.size > 0) out.push(parsed);
  }
  return out;
}

/** Highest bump found across all changesets in the PR (Map.prototype). */
function maxBump(changesets: ParsedChangeset[]): Bump | null {
  let best: Bump | null = null;
  for (const cs of changesets) {
    for (const b of cs.bumps.values()) {
      if (best === null || BUMP_RANK[b] > BUMP_RANK[best]) best = b;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// CI event payload — pull title from GITHUB_EVENT_PATH or env override.
// ---------------------------------------------------------------------------

interface PrPayload {
  title: string;
  body: string;
  number: number;
}

function readPrPayload(): PrPayload {
  if (process.env.PR_TITLE) {
    return {
      title: process.env.PR_TITLE,
      body: process.env.PR_BODY ?? '',
      number: Number(process.env.PR_NUMBER ?? 0),
    };
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) {
    fatal('No PR_TITLE env var and no GITHUB_EVENT_PATH — nothing to validate.');
  }
  const event = JSON.parse(readFileSync(eventPath as string, 'utf8'));
  if (!event.pull_request) {
    // Push event etc. — not our concern.
    console.log('Not a pull_request event; skipping.');
    process.exit(0);
  }
  return {
    title: event.pull_request.title ?? '',
    body: event.pull_request.body ?? '',
    number: event.pull_request.number ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Output helpers — emit GH-friendly annotations + a step summary.
// ---------------------------------------------------------------------------

function annotate(level: 'error' | 'warning' | 'notice', msg: string): void {
  console.log(`::${level}::${msg}`);
}

function summary(lines: string[]): void {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  // Lazy import to keep top-of-file imports minimal — this runs only
  // inside GitHub Actions where GITHUB_STEP_SUMMARY is set.
  const fs = require('node:fs');
  fs.appendFileSync(out, `${lines.join('\n')}\n`);
}

function fatal(msg: string): never {
  annotate('error', msg);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

function main(): void {
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = resolve(dirname(__filename), '..');

  const pr = readPrPayload();
  console.log(`Validating PR #${pr.number}: ${pr.title}`);

  const parsed = parseHeader(pr.title);
  if (!parsed) {
    annotate(
      'error',
      `PR title does not match Conventional Commits: "${pr.title}" — expected "<type>(<scope>)?: <subject>"`,
    );
    summary([
      '### Changeset gate: FAIL',
      '',
      `PR title \`${pr.title}\` does not match Conventional Commits format.`,
      '',
      'Examples:',
      '- `feat(core): add streamText API`',
      '- `fix(agent): handle null tool results`',
      '- `feat(providers-google)!: rename GoogleProvider config`',
      '',
      'See CONTRIBUTING.md > Conventional Commits.',
    ]);
    process.exit(1);
  }

  const isBreaking = parsed.isBreaking || bodyDeclaresBreaking(pr.body);
  const expected = expectedBump(parsed.type, isBreaking);

  // Non-release type: no changeset required, but if present that's fine.
  if (expected === null) {
    if (!RELEASE_TYPES.has(parsed.type) && !NON_RELEASE_TYPES.has(parsed.type)) {
      annotate(
        'error',
        `Unknown commit type "${parsed.type}". Allowed: ${[...RELEASE_TYPES, ...NON_RELEASE_TYPES].join(', ')}`,
      );
      process.exit(1);
    }
    console.log(`Type "${parsed.type}" is non-release — no changeset required.`);
    summary([
      '### Changeset gate: OK',
      '',
      `PR type \`${parsed.type}\` does not produce a release; changeset optional.`,
    ]);
    process.exit(0);
  }

  // Release type: a changeset MUST exist.
  const changesets = readChangesets(repoRoot);
  if (changesets.length === 0) {
    annotate(
      'error',
      `PR is type "${parsed.type}" (release-bumping) but no changeset found in .changeset/. Run \`pnpm changeset\` and commit the result.`,
    );
    summary([
      '### Changeset gate: FAIL',
      '',
      `PR type \`${parsed.type}${isBreaking ? '!' : ''}\` requires a changeset.`,
      '',
      `Run \`pnpm changeset\`, pick the affected package(s), choose \`${expected}\` (or higher), and commit the generated \`.changeset/*.md\`.`,
    ]);
    process.exit(1);
  }

  const got = maxBump(changesets);
  if (got === null) {
    annotate('error', 'No valid bump entries found in any changeset file.');
    process.exit(1);
  }

  if (BUMP_RANK[got] < BUMP_RANK[expected]) {
    annotate(
      'error',
      `PR type "${parsed.type}${isBreaking ? '!' : ''}" requires a \`${expected}\` bump (or higher) but the strongest changeset bump is \`${got}\`.`,
    );
    summary([
      '### Changeset gate: FAIL',
      '',
      `PR type \`${parsed.type}${isBreaking ? '!' : ''}\` requires a \`${expected}\` bump.`,
      `Strongest changeset bump found: \`${got}\`.`,
      '',
      'Bump policy:',
      '| PR type | Required bump |',
      '| --- | --- |',
      '| `feat` | minor |',
      '| `fix` / `perf` | patch |',
      '| `feat!` / `BREAKING CHANGE:` | major (strict pre-1.0) |',
      '',
      'Edit the changeset frontmatter or run `pnpm changeset` again with the correct bump.',
    ]);
    process.exit(1);
  }

  console.log(
    `OK — type "${parsed.type}${isBreaking ? '!' : ''}" expects "${expected}", changesets provide "${got}" (${changesets.length} file(s)).`,
  );
  summary([
    '### Changeset gate: OK',
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| PR type | \`${parsed.type}${isBreaking ? '!' : ''}\` |`,
    `| Scope | ${parsed.scope ? `\`${parsed.scope}\`` : '_none_'} |`,
    `| Required bump | \`${expected}\` |`,
    `| Changeset bump | \`${got}\` |`,
    `| Changeset files | ${changesets.length} |`,
  ]);
  process.exit(0);
}

try {
  main();
} catch (err) {
  fatal(`validate-changeset crashed: ${(err as Error).message}`);
}
