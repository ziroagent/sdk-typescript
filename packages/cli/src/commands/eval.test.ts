import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../util/logger.js';
import { runEvalCommand } from './eval.js';

// Spec fixtures must live inside the CLI package so Node can resolve
// `@ziro-agent/eval` via its workspace symlink. tmpdir() can't resolve that.
const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..', '..');

const SPEC_PASS = `
import { defineEval, exactMatch } from '@ziro-agent/eval';
export default defineEval({
  name: 'pass-spec',
  dataset: [
    { id: 'a', input: 'x', expected: 'x' },
    { id: 'b', input: 'y', expected: 'y' },
  ],
  run: (s) => s,
  graders: [exactMatch()],
  gate: { kind: 'meanScore', min: 0.9 },
});
`;

const SPEC_FAIL = `
import { defineEval, exactMatch } from '@ziro-agent/eval';
export default defineEval({
  name: 'fail-spec',
  dataset: [
    { id: 'a', input: 'x', expected: 'y' },
    { id: 'b', input: 'y', expected: 'z' },
  ],
  run: (s) => s,
  graders: [exactMatch()],
  gate: { kind: 'meanScore', min: 0.9 },
});
`;

const NOT_A_SPEC = `
export const value = { not: 'a spec' };
`;

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(PKG_ROOT, '__eval_fixtures_'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeSpec(name: string, source: string): string {
  const file = join(tmpDir, name);
  writeFileSync(file, source);
  return file;
}

const silentLogger = () => {
  const log = createLogger();
  // Spy/no-op so test output stays clean.
  for (const k of ['info', 'warn', 'error', 'success', 'step'] as const) {
    (log as unknown as Record<typeof k, () => void>)[k] = () => undefined;
  }
  return log;
};

describe('runEvalCommand', () => {
  it('returns 2 when no patterns are provided', async () => {
    const code = await runEvalCommand({ patterns: [], cwd: tmpDir, logger: silentLogger() });
    expect(code).toBe(2);
  });

  it('returns 2 when no specs are loaded', async () => {
    const file = writeSpec('not-a-spec.mjs', NOT_A_SPEC);
    const code = await runEvalCommand({
      patterns: [file],
      cwd: tmpDir,
      logger: silentLogger(),
    });
    expect(code).toBe(2);
  });

  it('returns 0 when all specs pass their gate', async () => {
    const file = writeSpec('passing.mjs', SPEC_PASS);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runEvalCommand({
      patterns: [file],
      cwd: tmpDir,
      logger: silentLogger(),
    });
    writeSpy.mockRestore();
    expect(code).toBe(0);
  });

  it('returns 1 when at least one spec fails its gate', async () => {
    const file = writeSpec('failing.mjs', SPEC_FAIL);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runEvalCommand({
      patterns: [file],
      cwd: tmpDir,
      logger: silentLogger(),
    });
    writeSpy.mockRestore();
    expect(code).toBe(1);
  });

  it('--gate override turns a failing run into a passing one', async () => {
    const file = writeSpec('failing.mjs', SPEC_FAIL);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runEvalCommand({
      patterns: [file],
      cwd: tmpDir,
      logger: silentLogger(),
      gate: 0,
    });
    writeSpy.mockRestore();
    expect(code).toBe(0);
  });

  it('writes a JSON report when --out is provided', async () => {
    const file = writeSpec('passing.mjs', SPEC_PASS);
    const out = join(tmpDir, 'report.json');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runEvalCommand({
      patterns: [file],
      cwd: tmpDir,
      logger: silentLogger(),
      outFile: out,
    });
    writeSpy.mockRestore();
    const parsed = JSON.parse(readFileSync(out, 'utf8'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].run.spec.name).toBe('pass-spec');
  });

  it('reporter=json emits a JSON payload to stdout', async () => {
    const file = writeSpec('passing.mjs', SPEC_PASS);
    const chunks: string[] = [];
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
        return true;
      });
    await runEvalCommand({
      patterns: [file],
      cwd: tmpDir,
      logger: silentLogger(),
      reporter: 'json',
    });
    writeSpy.mockRestore();
    const joined = chunks.join('');
    const parsed = JSON.parse(joined);
    expect(parsed.summaries[0].run.spec.name).toBe('pass-spec');
    expect(parsed.anyGateFailed).toBe(false);
  });
});
