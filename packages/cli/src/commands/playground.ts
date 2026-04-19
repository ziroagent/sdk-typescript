import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../util/logger.js';

export interface PlaygroundOptions {
  port?: number;
  cwd?: string;
  logger: Logger;
}

/**
 * Boot the playground (Next.js 15) in dev mode. The playground app is
 * shipped as part of the monorepo and lives at `apps/playground`. When the
 * CLI is invoked from a published install, we report a clear message because
 * the playground is currently a dev-time tool only.
 */
export async function runPlayground(options: PlaygroundOptions): Promise<number> {
  const dir = findPlaygroundDir();
  if (!dir) {
    options.logger.warn(
      'apps/playground not found. The dev playground only ships in the monorepo.',
    );
    options.logger.info(
      'Clone the repo and run `pnpm --filter @ziro-ai/playground dev` instead.',
    );
    return 1;
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.port !== undefined) env.PORT = String(options.port);

  options.logger.step(`Starting playground from ${dir}`);
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('pnpm', ['--dir', dir, 'dev'], {
      stdio: 'inherit',
      env,
      cwd: options.cwd ?? process.cwd(),
    });
    child.on('error', rejectPromise);
    child.on('exit', (code) => resolvePromise(code ?? 0));
  });
}

function findPlaygroundDir(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  let cur = here;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(cur, 'apps', 'playground');
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    cur = dirname(cur);
  }
  return undefined;
}
