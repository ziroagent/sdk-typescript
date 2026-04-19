import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../util/logger.js';

export interface RunOptions {
  example: string;
  cwd: string;
  logger: Logger;
}

/**
 * Resolve and execute an example from the monorepo's `examples/<name>` folder.
 * The CLI is published from a workspace package, so end-users will only see
 * examples that ship inside the published tarball; in the dev monorepo we
 * walk up to the repo root.
 */
export async function runExample(options: RunOptions): Promise<number> {
  const exampleDir = resolveExampleDir(options.example);
  if (!exampleDir) {
    throw new Error(
      `Unknown example "${options.example}". Run \`ziroagent run --list\` to see available examples.`,
    );
  }

  const entry = ['index.ts', 'index.js', 'main.ts', 'main.js']
    .map((f) => join(exampleDir, f))
    .find((p) => existsSync(p));
  if (!entry) {
    throw new Error(`Example "${options.example}" has no index.ts / index.js entry point.`);
  }

  options.logger.step(`Running example: ${options.example}`);
  const isTs = entry.endsWith('.ts');
  return await spawnAndWait(isTs ? 'tsx' : 'node', [entry], { cwd: exampleDir });
}

export function listExamples(): string[] {
  const root = findExamplesRoot();
  if (!root) return [];
  try {
    // Lazy require to avoid pulling in fs at top level for tree-shaking.
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    return readdirSync(root).filter((e: string) => statSync(join(root, e)).isDirectory());
  } catch {
    return [];
  }
}

function resolveExampleDir(name: string): string | undefined {
  const root = findExamplesRoot();
  if (!root) return undefined;
  const candidate = join(root, name);
  return existsSync(candidate) ? candidate : undefined;
}

function findExamplesRoot(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  let cur = here;
  for (let i = 0; i < 6; i++) {
    const candidate = join(cur, 'examples');
    if (existsSync(candidate)) return candidate;
    cur = dirname(cur);
  }
  return undefined;
}

function spawnAndWait(
  cmd: string,
  args: string[],
  opts: { cwd: string },
): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: 'inherit' });
    child.on('error', rejectPromise);
    child.on('exit', (code) => resolvePromise(code ?? 0));
  });
}
