/**
 * Wraps `changeset publish` with bounded retries and backoff so large
 * monorepo publishes survive transient npm rate limits (HTTP 429).
 *
 * Environment (optional):
 * - `CHANGESET_PUBLISH_MAX_ATTEMPTS` — default `8`
 * - `CHANGESET_PUBLISH_BASE_DELAY_MS` — default `30000` (first backoff scales from this)
 * - `CHANGESET_PUBLISH_MAX_DELAY_MS` — default `600000` (cap each wait, ~10 minutes; CI should set lower so the GitHub job `timeout-minutes` is not exceeded)
 * - `CHANGESET_PUBLISH_429_MIN_WAIT_MS` — when the captured log tail looks like npm 429 / rate limit, wait at least this many ms before the next full publish (default `0` = off). CI should set ~5–10 minutes so the registry window can reset.
 * - `NPM_CONFIG_MAXSOCKETS` — passed through; default `1` inside this script to reduce parallel PUTs
 */
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const maxAttempts = Math.max(1, Number(process.env.CHANGESET_PUBLISH_MAX_ATTEMPTS ?? '8'));
const baseDelayMs = Math.max(0, Number(process.env.CHANGESET_PUBLISH_BASE_DELAY_MS ?? '30000'));
const maxDelayMs = Math.max(
  baseDelayMs,
  Number(process.env.CHANGESET_PUBLISH_MAX_DELAY_MS ?? String(10 * 60 * 1000)),
);
const min429WaitMs = Math.max(0, Number(process.env.CHANGESET_PUBLISH_429_MIN_WAIT_MS ?? '0'));
const tailMaxChars = Math.max(
  4096,
  Number(process.env.CHANGESET_PUBLISH_LOG_TAIL_CHARS ?? `${96 * 1024}`),
);

function computeDelayMs(failedAttemptIndex) {
  const exp = Math.round(baseDelayMs * 2 ** failedAttemptIndex);
  const capped = Math.min(maxDelayMs, exp);
  const jitter = Math.floor(Math.random() * Math.min(45_000, Math.max(1, Math.floor(capped / 5))));
  return capped + jitter;
}

function looksLikeNpmRateLimit(tail) {
  const t = tail.toLowerCase();
  return (
    t.includes('e429') ||
    t.includes('429 too many requests') ||
    t.includes('rate limit') ||
    t.includes('rate limited')
  );
}

function runPublish() {
  let logTail = '';
  const append = (chunk) => {
    logTail = (logTail + chunk.toString('utf8')).slice(-tailMaxChars);
  };

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      NPM_CONFIG_MAXSOCKETS: process.env.NPM_CONFIG_MAXSOCKETS ?? '1',
    };
    const child = spawn('pnpm', ['exec', 'changeset', 'publish'], {
      env,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d) => {
      process.stdout.write(d);
      append(d);
    });
    child.stderr?.on('data', (d) => {
      process.stderr.write(d);
      append(d);
    });
    child.on('error', (err) => {
      console.error(err);
      resolve({ code: 1, tail: logTail });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, tail: logTail });
    });
  });
}

let lastStatus = 1;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const { code, tail } = await runPublish();
  lastStatus = code ?? 1;
  if (lastStatus === 0) {
    process.exit(0);
  }
  if (attempt >= maxAttempts) {
    break;
  }
  const baseDelay = computeDelayMs(attempt);
  const rateLimited = min429WaitMs > 0 && looksLikeNpmRateLimit(tail);
  const delayMs = rateLimited ? Math.max(baseDelay, min429WaitMs) : baseDelay;
  console.error(
    `[changeset-publish-retry] attempt ${attempt}/${maxAttempts} exited ${lastStatus};${rateLimited ? ' npm rate-limit pattern in log tail →' : ''} waiting ${delayMs}ms before retry...`,
  );
  await setTimeout(delayMs);
}

process.exit(lastStatus);
