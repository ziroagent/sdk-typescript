import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../util/logger.js';

export interface InitOptions {
  /** Target directory (relative or absolute). Defaults to CWD. */
  cwd: string;
  /** Project name; falls back to the basename of `cwd`. */
  name?: string;
  /** Template id; only `basic` ships in v0.1. */
  template?: 'basic';
  /** Overwrite an existing non-empty directory. */
  force?: boolean;
  logger: Logger;
}

/**
 * Resolve the bundled `templates/<id>/` directory. We resolve relative to the
 * compiled `dist/cli.js` file using `import.meta.url`, then walk up to the
 * package root. This works in both ESM and CJS builds (tsup rewrites
 * `import.meta.url` for CJS via the `__importMetaUrl` shim).
 */
function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Search up to 5 levels up for a `templates/` sibling. Handles both:
  //   - dist/cli.js  → pkg/templates
  //   - src/commands/init.ts (vitest) → pkg/templates
  //   - dist/index.js → pkg/templates
  let cur = here;
  for (let i = 0; i < 5; i++) {
    const candidate = join(cur, 'templates');
    if (existsSync(candidate)) return candidate;
    cur = resolve(cur, '..');
  }
  return resolve(here, '..', 'templates');
}

export async function runInit(options: InitOptions): Promise<void> {
  const target = resolve(options.cwd);
  const template = options.template ?? 'basic';
  const tplDir = join(templatesDir(), template);

  if (!existsSync(tplDir)) {
    throw new Error(`Unknown template "${template}". Available: basic.`);
  }

  if (existsSync(target)) {
    const entries = await readdir(target);
    const visible = entries.filter((e) => !e.startsWith('.'));
    if (visible.length > 0 && !options.force) {
      throw new Error(`Target directory ${target} is not empty. Pass --force to overwrite.`);
    }
  } else {
    await mkdir(target, { recursive: true });
  }

  options.logger.step(`Scaffolding from template "${template}"`);
  await copyDir(tplDir, target);

  // Customize package.json with project name.
  const pkgPath = join(target, 'package.json');
  if (existsSync(pkgPath)) {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    pkg.name = options.name ?? basename(target);
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }

  options.logger.success(`Created ${target}`);
  options.logger.info('Next steps:');
  options.logger.info('  cp .env.example .env  (and fill in your keys)');
  options.logger.info('  pnpm install');
  options.logger.info('  pnpm start');
}

async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    const st = await stat(s);
    if (st.isDirectory()) {
      await copyDir(s, d);
    } else {
      await copyFile(s, d);
    }
  }
}

function basename(p: string): string {
  const norm = p.replace(/[\\/]+$/, '');
  const i = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  return i === -1 ? norm : norm.slice(i + 1);
}
