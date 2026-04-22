/**
 * Wraps `changeset publish` with bounded retries and backoff so large
 * monorepo publishes survive transient npm rate limits (HTTP 429).
 *
 * Environment (optional):
 * - `CHANGESET_PUBLISH_MAX_ATTEMPTS` — default `8`
 * - `CHANGESET_PUBLISH_BASE_DELAY_MS` — default `30000` (first backoff scales from this)
 * - `CHANGESET_PUBLISH_MAX_DELAY_MS` — default `600000` (cap each wait; CI should set lower so the GitHub job `timeout-minutes` is not exceeded)
 * - `NPM_CONFIG_MAXSOCKETS` — passed through; default `1` inside this script to reduce parallel PUTs
 */
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const maxAttempts = Math.max(1, Number(process.env.CHANGESET_PUBLISH_MAX_ATTEMPTS ?? '8'));
const baseDelayMs = Math.max(0, Number(process.env.CHANGESET_PUBLISH_BASE_DELAY_MS ?? '30000'));
const maxDelayMs = Math.max(
  baseDelayMs,
  Number(process.env.CHANGESET_PUBLISH_MAX_DELAY_MS ?? String(10 * 60 * 1000)),
);

function computeDelayMs(failedAttemptIndex) {
  const exp = Math.round(baseDelayMs * 2 ** failedAttemptIndex);
  const capped = Math.min(maxDelayMs, exp);
  const jitter = Math.floor(Math.random() * Math.min(45_000, Math.max(1, Math.floor(capped / 5))));
  return capped + jitter;
}

function runPublish() {
  const env = {
    ...process.env,
    // Encourage sequential registry writes; helps when Changesets publishes multiple tarballs.
    NPM_CONFIG_MAXSOCKETS: process.env.NPM_CONFIG_MAXSOCKETS ?? '1',
  };
  return spawnSync('pnpm', ['exec', 'changeset', 'publish'], {
    stdio: 'inherit',
    env,
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
  const delayMs = computeDelayMs(attempt);
  console.error(
    `[changeset-publish-retry] attempt ${attempt}/${maxAttempts} exited ${lastStatus}; waiting ${delayMs}ms before retry...`,
  );
  await setTimeout(delayMs);
}

process.exit(lastStatus);
