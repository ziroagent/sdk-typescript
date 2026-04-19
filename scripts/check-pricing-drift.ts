#!/usr/bin/env -S node --experimental-strip-types
/**
 * Pricing-table drift checker.
 *
 * Walks `packages/core/src/pricing/data.ts` and verifies the `validFrom`
 * timestamps haven't drifted past the configured staleness window. Run
 * weekly in CI; failures intentionally do NOT block PRs — they create an
 * issue / annotation so a maintainer is reminded to re-verify the table
 * against the live provider pricing pages.
 *
 * v0.1.6 ships the `validFrom`-only check (cheap, deterministic, no
 * network). A future iteration can fetch the live pricing pages
 * (`https://openai.com/api/pricing/`, `https://www.anthropic.com/pricing`)
 * and diff numeric values; that's gated on selecting an HTML-scraping
 * strategy that survives provider page restyles.
 *
 * Exit codes:
 *   0 — every entry is within the staleness window.
 *   1 — at least one entry is older than the threshold (warn-only in CI).
 *   2 — the script itself failed (parse error, missing file).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Default: warn when pricing is older than 60 days. Override with
// `STALENESS_DAYS=30 pnpm tsx scripts/check-pricing-drift.ts`.
const STALENESS_DAYS = Number(process.env.STALENESS_DAYS ?? 60);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRICING_FILE = resolve(__dirname, '../packages/core/src/pricing/data.ts');

interface Entry {
  provider: string;
  modelId: string;
  validFrom: string;
  notes?: string;
}

function parseEntries(source: string): Entry[] {
  // Lightweight regex parse — we deliberately don't `eval` the TS file. The
  // shape is stable (see `data.ts` ENTRIES literal); if a maintainer
  // restructures it, this script will report 0 entries and the CI step
  // will fail, prompting an update here.
  const out: Entry[] = [];
  const blockRe =
    /\{\s*provider:\s*['"](openai|anthropic)['"][\s\S]*?validFrom:\s*([A-Z_]+|['"][\d-]+['"])[\s\S]*?\}/g;
  const modelIdRe = /modelId:\s*['"]([^'"]+)['"]/;
  const notesRe = /notes:\s*['"]([^'"]+)['"]/;

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
  while ((match = blockRe.exec(source))) {
    const block = match[0] ?? '';
    const provider = match[1] ?? '';
    const validFromRaw = match[2] ?? '';
    const modelId = block.match(modelIdRe)?.[1];
    const notes = block.match(notesRe)?.[1];
    if (!modelId) continue;

    let validFrom: string;
    if (/^['"]/.test(validFromRaw)) {
      validFrom = validFromRaw.replace(/^['"]|['"]$/g, '');
    } else {
      // It's a constant reference (e.g. VALID_FROM). Resolve from the source.
      const constMatch = source.match(
        new RegExp(`const\\s+${validFromRaw}\\s*=\\s*['"]([\\d-]+)['"]`),
      );
      if (!constMatch?.[1]) continue;
      validFrom = constMatch[1];
    }

    out.push({
      provider,
      modelId,
      validFrom,
      ...(notes !== undefined ? { notes } : {}),
    });
  }
  return out;
}

function ageDays(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / MS_PER_DAY);
}

function main(): number {
  let source: string;
  try {
    source = readFileSync(PRICING_FILE, 'utf8');
  } catch (err) {
    console.error(`fatal: could not read ${PRICING_FILE}:`, err);
    return 2;
  }

  const entries = parseEntries(source);
  if (entries.length === 0) {
    console.error(
      'fatal: parsed 0 pricing entries — has data.ts been restructured? ' +
        'Update scripts/check-pricing-drift.ts to match.',
    );
    return 2;
  }

  const now = new Date();
  const stale: Array<Entry & { ageDays: number }> = [];

  for (const e of entries) {
    const age = ageDays(e.validFrom, now);
    if (age > STALENESS_DAYS) stale.push({ ...e, ageDays: age });
  }

  console.log(`Checked ${entries.length} pricing entries (threshold: ${STALENESS_DAYS}d).`);

  if (stale.length === 0) {
    console.log('All entries within the freshness window.');
    return 0;
  }

  console.log('');
  console.log(`Stale entries (${stale.length}):`);
  for (const e of stale) {
    console.log(
      `  - ${e.provider}/${e.modelId} — validFrom=${e.validFrom} (${e.ageDays}d old)` +
        (e.notes ? ` [${e.notes}]` : ''),
    );
  }
  console.log('');
  console.log(
    'Action: open packages/core/src/pricing/data.ts, re-verify these ' +
      'entries against the provider pricing pages, then bump VALID_FROM.',
  );
  return 1;
}

process.exit(main());
