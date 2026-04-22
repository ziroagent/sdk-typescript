/**
 * Runs `changeset-publish-retry.js`, then on failure runs `publish-sandbox-rescue.js`
 * so npm 429s on the tail of a large `changeset publish` can be retried with minimal
 * extra registry traffic (cross‑platform; avoids shell `||` in package.json scripts).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const retryPath = fileURLToPath(new URL('./changeset-publish-retry.js', import.meta.url));
const rescuePath = fileURLToPath(new URL('./publish-sandbox-rescue.js', import.meta.url));

const retry = spawnSync(process.execPath, [retryPath], {
  stdio: 'inherit',
  env: process.env,
  cwd: root,
  shell: false,
});
if ((retry.status ?? 1) === 0) {
  process.exit(0);
}
console.error(
  '[publish-with-sandbox-rescue] changeset publish did not succeed; running sandbox rescue...',
);
const rescue = spawnSync(process.execPath, [rescuePath], {
  stdio: 'inherit',
  env: process.env,
  cwd: root,
  shell: false,
});
process.exit(rescue.status ?? 1);
