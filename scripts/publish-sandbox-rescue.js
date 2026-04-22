/**
 * Sequential `pnpm publish` for packages that often hit npm E429 after a full
 * `changeset publish` burst. Skips packages already present at `package.json` version.
 *
 * Environment (optional):
 * - `SANDBOX_PUBLISH_RESCUE` — set to `0` to skip this script (exits 1).
 * - `SANDBOX_PUBLISH_RESCUE_PACKAGES` — comma‑separated package names (default: sandbox-e2b + sandbox-modal).
 * - `SANDBOX_RESCUE_MAX_ATTEMPTS` — per package (default `8`).
 * - `SANDBOX_RESCUE_RETRY_DELAY_MS` — wait after a failed publish before retry (default `420000`, ~7m).
 * - `SANDBOX_RESCUE_INTER_PACKAGE_DELAY_MS` — wait before each package after the first (default `300000`, ~5m).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

if (process.env.SANDBOX_PUBLISH_RESCUE === '0') {
  console.error('[publish-sandbox-rescue] disabled (SANDBOX_PUBLISH_RESCUE=0)');
  process.exit(1);
}

const defaultPkgs = '@ziro-agent/sandbox-e2b,@ziro-agent/sandbox-modal';
const packageNames = (process.env.SANDBOX_PUBLISH_RESCUE_PACKAGES ?? defaultPkgs)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const maxAttempts = Math.max(1, Number(process.env.SANDBOX_RESCUE_MAX_ATTEMPTS ?? '8'));
const retryDelayMs = Math.max(0, Number(process.env.SANDBOX_RESCUE_RETRY_DELAY_MS ?? '420000'));
const interPackageDelayMs = Math.max(
  0,
  Number(process.env.SANDBOX_RESCUE_INTER_PACKAGE_DELAY_MS ?? '300000'),
);

function findPackageDir(packageName) {
  const packagesRoot = join(process.cwd(), 'packages');
  for (const ent of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const pjPath = join(packagesRoot, ent.name, 'package.json');
    try {
      const manifest = JSON.parse(readFileSync(pjPath, 'utf8'));
      if (manifest.name === packageName && manifest.private !== true) {
        return join(packagesRoot, ent.name);
      }
    } catch {
      /* skip invalid */
    }
  }
  return null;
}

function isVersionPublished(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) return false;
  return result.stdout.trim() === version;
}

function publishOnce(dir) {
  const env = {
    ...process.env,
    NPM_CONFIG_MAXSOCKETS: process.env.NPM_CONFIG_MAXSOCKETS ?? '1',
  };
  return spawnSync('pnpm', ['publish', '--access', 'public', '--no-git-checks'], {
    cwd: dir,
    stdio: 'inherit',
    env,
    shell: false,
  });
}

let anyFailed = false;
for (let i = 0; i < packageNames.length; i++) {
  const name = packageNames[i];
  if (i > 0 && interPackageDelayMs > 0) {
    console.error(
      `[publish-sandbox-rescue] waiting ${interPackageDelayMs}ms before next package (${name})...`,
    );
    await setTimeout(interPackageDelayMs);
  }

  const dir = findPackageDir(name);
  if (!dir) {
    console.error(`[publish-sandbox-rescue] could not resolve directory for ${name}`);
    anyFailed = true;
    continue;
  }

  const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (isVersionPublished(name, version)) {
    console.error(`[publish-sandbox-rescue] ${name}@${version} already on npm — skip`);
    continue;
  }

  let published = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = publishOnce(dir);
    const code = result.status ?? 1;
    if (code === 0) {
      published = true;
      break;
    }
    if (attempt >= maxAttempts) {
      break;
    }
    console.error(
      `[publish-sandbox-rescue] ${name}: publish attempt ${attempt}/${maxAttempts} failed; waiting ${retryDelayMs}ms...`,
    );
    await setTimeout(retryDelayMs);
  }

  if (!published) {
    console.error(`[publish-sandbox-rescue] gave up on ${name}@${version}`);
    anyFailed = true;
  }
}

process.exit(anyFailed ? 1 : 0);
