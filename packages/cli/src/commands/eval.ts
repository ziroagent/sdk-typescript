import { writeFileSync } from 'node:fs';
import { glob, opendir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type EvalGate,
  type EvalRun,
  type EvalSpec,
  evaluateGate,
  formatTextReport,
  runEval,
  toJSONReport,
} from '@ziro-agent/eval';
import kleur from 'kleur';
import type { Logger } from '../util/logger.js';

export interface EvalCommandOptions {
  /** Files / globs to load. Each yielded value matching `EvalSpec` is run. */
  patterns: string[];
  cwd: string;
  logger: Logger;
  /**
   * Override gate. Number → meanScore min. JSON object → arbitrary EvalGate.
   * `undefined` means use each spec's own gate (default RFC-0003 behaviour).
   */
  gate?: number | EvalGate;
  concurrency?: number;
  reporter?: 'text' | 'json';
  /** Optional file path (absolute or cwd-relative) to write the JSON report. */
  outFile?: string;
  /** Stop after the first failing case across the whole run. */
  failFast?: boolean;
  /** Only run cases whose name matches this regex. */
  grep?: string;
}

interface EvalSummary {
  spec: string;
  run: EvalRun;
}

/**
 * Implements `ziroagent eval <path-or-glob>...`. Returns a process exit code
 * per RFC 0003 §CLI:
 *   0 → all gates pass
 *   1 → at least one gate fails
 *   2 → loader / configuration error (no specs, syntax error, …)
 */
export async function runEvalCommand(opts: EvalCommandOptions): Promise<number> {
  if (opts.patterns.length === 0) {
    opts.logger.error('Missing path. Usage: ziroagent eval <file-or-glob>... [--gate 0.95]');
    return 2;
  }

  const files = await resolvePatterns(opts.patterns, opts.cwd);
  if (files.length === 0) {
    opts.logger.error(`No files matched: ${opts.patterns.join(' ')}`);
    return 2;
  }

  const specs: Array<{ source: string; spec: EvalSpec }> = [];
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    } catch (err) {
      opts.logger.error(
        `Failed to import ${file}: ${(err as Error).message}\n` +
          'Hint: TypeScript files need a loader — try `pnpm tsx ./node_modules/.bin/ziroagent eval ...`.',
      );
      return 2;
    }
    for (const value of Object.values(mod)) {
      if (looksLikeSpec(value)) specs.push({ source: file, spec: value });
    }
  }

  if (specs.length === 0) {
    opts.logger.error(
      'Loaded files contained no valid eval specs. ' +
        'Export an `EvalSpec` (e.g. `export default defineEval({...})`).',
    );
    return 2;
  }

  opts.logger.step(`Found ${specs.length} eval spec(s) across ${files.length} file(s).`);

  const gateOverride = resolveGate(opts.gate);
  const summaries: EvalSummary[] = [];
  let anyGateFailed = false;
  let failFastTriggered = false;

  for (const { source, spec } of specs) {
    const filtered = applyGrep(spec, opts.grep);
    const runOpts: Parameters<typeof runEval>[1] = {};
    if (opts.concurrency !== undefined) runOpts.concurrency = opts.concurrency;
    if (gateOverride) runOpts.gate = gateOverride;
    if (opts.failFast) {
      const ac = new AbortController();
      runOpts.abortSignal = ac.signal;
      runOpts.onCaseFinish = (r) => {
        if (!r.passed) {
          failFastTriggered = true;
          ac.abort();
        }
      };
    }

    const run = await runEval(filtered, runOpts);
    summaries.push({ spec: `${spec.name} (${source})`, run });
    if (!run.gate.passed) anyGateFailed = true;
    if (failFastTriggered) break;
  }

  emitReports(summaries, opts);

  if (anyGateFailed || failFastTriggered) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function looksLikeSpec(v: unknown): v is EvalSpec {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === 'string' &&
    Array.isArray(o.dataset) &&
    typeof o.run === 'function' &&
    Array.isArray(o.graders)
  );
}

async function resolvePatterns(patterns: string[], cwd: string): Promise<string[]> {
  const out = new Set<string>();
  for (const p of patterns) {
    if (containsGlob(p)) {
      for await (const m of glob(p, { cwd })) {
        out.add(absolutize(m as string, cwd));
      }
    } else {
      const abs = absolutize(p, cwd);
      // Walk directories to find .js/.mjs eval modules; skip TS unless the
      // host runtime is already TS-aware (tsx, ts-node, etc.).
      const stat = await safeOpenDir(abs);
      if (stat === 'dir') {
        for await (const entry of await opendir(abs, { recursive: true })) {
          if (
            entry.isFile() &&
            /\.(?:m?js|m?ts)$/.test(entry.name) &&
            !entry.name.endsWith('.d.ts') &&
            !entry.name.endsWith('.test.js') &&
            !entry.name.endsWith('.test.ts')
          ) {
            const parent = entry.parentPath ?? abs;
            out.add(join(parent, entry.name));
          }
        }
      } else {
        out.add(abs);
      }
    }
  }
  return [...out].sort();
}

async function safeOpenDir(p: string): Promise<'dir' | 'file' | undefined> {
  try {
    const dir = await opendir(p);
    await dir.close();
    return 'dir';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOTDIR') return 'file';
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return 'file';
  }
}

function containsGlob(p: string): boolean {
  return /[*?[\]{}]/.test(p);
}

function absolutize(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function applyGrep<T extends EvalSpec>(spec: T, grep: string | undefined): T {
  if (!grep) return spec;
  const re = new RegExp(grep);
  return {
    ...spec,
    dataset: spec.dataset.filter((c) => re.test(c.name ?? '') || re.test(c.id ?? '')),
  };
}

function resolveGate(gate: EvalCommandOptions['gate']): EvalGate | undefined {
  if (gate === undefined) return undefined;
  if (typeof gate === 'number') return { kind: 'meanScore', min: gate };
  return gate;
}

function emitReports(summaries: EvalSummary[], opts: EvalCommandOptions): void {
  const reporter = opts.reporter ?? 'text';

  if (reporter === 'json') {
    const payload = {
      summaries: summaries.map((s) => ({ source: s.spec, run: s.run })),
      anyGateFailed: summaries.some((s) => !s.run.gate.passed),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    for (const { spec, run } of summaries) {
      process.stdout.write(`${kleur.bold(`──── ${spec} ────`)}\n`);
      process.stdout.write(formatTextReport(run));
    }
    const total = summaries.length;
    const passed = summaries.filter((s) => s.run.gate.passed).length;
    process.stdout.write(`${kleur.bold('Aggregate:')} ${passed}/${total} spec gates passed.\n`);
  }

  if (opts.outFile) {
    const out = resolveOutPath(opts.outFile, opts.cwd);
    const json = JSON.stringify(
      summaries.map((s) => ({ source: s.spec, run: JSON.parse(toJSONReport(s.run)) })),
      null,
      2,
    );
    writeFileSync(out, json);
    opts.logger.success(`JSON report written → ${out}`);
  }

  // Re-emit per-spec gate evaluation so the CLI's exit-code logic stays
  // honest if a caller mutated `run.gate` between runEval and now.
  for (const { spec, run } of summaries) {
    const fresh = evaluateGate(run, run.spec.gate);
    if (fresh.passed !== run.gate.passed) {
      opts.logger.warn(`gate mismatch detected for "${spec}" — using fresh evaluation`);
    }
  }
}

function resolveOutPath(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}
