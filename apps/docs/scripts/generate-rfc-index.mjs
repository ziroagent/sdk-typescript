/**
 * Writes `content/docs/rfc-index.mdx` from `rfcs/*.md` at the monorepo root.
 * Run from `apps/docs` via `pnpm run rfc:index` or as part of `prebuild`.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GITHUB = 'https://github.com/ziroagent/sdk-typescript/blob/main/rfcs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, '..');
const repoRoot = join(docsRoot, '..', '..');
const rfcsDir = join(repoRoot, 'rfcs');
const outFile = join(docsRoot, 'content/docs/rfc-index.mdx');

function cell(s) {
  return String(s).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|').slice(0, 220);
}

async function main() {
  const names = (await readdir(rfcsDir))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort();

  const rows = [];
  for (const name of names) {
    const raw = await readFile(join(rfcsDir, name), 'utf8');
    const firstLine = raw.split(/\r?\n/)[0] ?? '';
    const title = firstLine.startsWith('# ') ? firstLine.slice(2).trim() : name;
    const statusMatch = raw.match(/^\s*-\s*Status:\s*(.+)$/m);
    const status = statusMatch?.[1]?.trim() ?? '—';
    const link = `${GITHUB}/${name}`;
    rows.push({ name, title, status, link });
  }

  const table = [
    '| RFC | Title | Status | Source |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| \`${r.name.replace('.md', '')}\` | ${cell(r.title)} | ${cell(r.status)} | [View on GitHub](${r.link}) |`,
    ),
  ].join('\n');

  const mdx = `---
title: RFC index
description: Design RFCs for the ZiroAgent SDK (generated from the repository).
---

This page is **generated** — do not edit by hand. Source: \`apps/docs/scripts/generate-rfc-index.mjs\` and \`rfcs/*.md\`.

The canonical text, status lines, and discussion live in the GitHub repository. Follow links to read the full RFC (including deferred work, gap matrices, and open questions).

${table}

## Gaps and follow-ups (selected)

MVP **replay** for resumable \`streamText\` / \`resumeKey\` (in-memory + optional Redis) is [shipped in the SDK](https://github.com/ziroagent/sdk-typescript/blob/main/ROADMAP.md) — “replay then continue upstream” is specified in [RFC 0017](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0017-resumable-stream-continue-upstream.md) (not yet implemented). Other high-level gaps in [RFC 0008 (Roadmap v3)](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0008-roadmap-v3.md) include **full OpenAPI → tools** beyond GET ([RFC 0010](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0010-openapi-tools.md)), **RAG hardening** ([RFC 0012](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0012-rag-hardening.md)), **compliance pack** depth ([RFC 0016](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0016-compliance-pack.md)), and many others — see the gap matrix in RFC 0008.
`;

  await writeFile(outFile, mdx, 'utf8');
  console.log(`[rfc-index] wrote ${rows.length} rows -> content/docs/rfc-index.mdx`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
