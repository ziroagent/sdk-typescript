import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger } from '../util/logger.js';
import { runInit } from './init.js';

const silentLogger = createLogger(
  Object.assign(Object.create(null), {
    write() {
      return true;
    },
  }) as NodeJS.WriteStream,
);

let tmp: string | undefined;
afterEach(async () => {
  if (tmp) {
    await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  }
});

describe('runInit', () => {
  it('scaffolds a fresh directory from the basic template', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'ziroagent-init-'));
    const target = join(tmp, 'my-app');
    await runInit({ cwd: target, name: 'my-app', logger: silentLogger });
    const entries = await readdir(target);
    expect(entries).toContain('package.json');
    expect(entries).toContain('index.ts');
    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('my-app');
  });

  it('refuses to overwrite a non-empty directory without --force', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'ziroagent-init-'));
    await runInit({ cwd: tmp, logger: silentLogger });
    await expect(runInit({ cwd: tmp, logger: silentLogger })).rejects.toThrow(/not empty/);
  });

  it('overwrites with --force', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'ziroagent-init-'));
    await runInit({ cwd: tmp, logger: silentLogger });
    await expect(runInit({ cwd: tmp, force: true, logger: silentLogger })).resolves.toBeUndefined();
  });

  it('rejects unknown templates', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'ziroagent-init-'));
    await expect(
      runInit({ cwd: tmp, template: 'wat' as 'basic', logger: silentLogger }),
    ).rejects.toThrow(/Unknown template/);
  });
});
