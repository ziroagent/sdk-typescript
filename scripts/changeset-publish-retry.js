/**
 * Wraps `changeset publish` with bounded retries and backoff so large
 * monorepo publishes survive transient npm rate limits (HTTP 429).
 *
 * Environment (optional):
 * - `CHANGESET_PUBLISH_MAX_ATTEMPTS` — default `6`
 * - `CHANGESET_PUBLISH_BASE_DELAY_MS` — default `20000` (linear backoff: base × attempt before next try)
 */
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const maxAttempts = Math.max(1, Number(process.env.CHANGESET_PUBLISH_MAX_ATTEMPTS ?? '6'));
const baseDelayMs = Math.max(0, Number(process.env.CHANGESET_PUBLISH_BASE_DELAY_MS ?? '20000'));

function runPublish() {
  return spawnSync('pnpm', ['exec', 'changeset', 'publish'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
}

let lastStatus = 1;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const result = runPublish();
  lastStatus = result.status ?? 1;
  if (lastStatus === 0) {
    process.exit(0);
  }
  if (attempt >= maxAttempts) {
    break;
  }
  const delayMs = baseDelayMs * attempt;
  console.error(
    `[changeset-publish-retry] attempt ${attempt}/${maxAttempts} exited ${lastStatus}; waiting ${delayMs}ms before retry...`,
  );
  await setTimeout(delayMs);
}

process.exit(lastStatus);
