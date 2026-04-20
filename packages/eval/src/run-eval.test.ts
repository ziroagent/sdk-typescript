import { describe, expect, it } from 'vitest';
import { exactMatch } from './graders/exact-match.js';
import { latency } from './graders/latency.js';
import { defineEval, runEval } from './run-eval.js';
import type { Grader } from './types.js';

describe('runEval', () => {
  it('runs every case, every grader, and aggregates a meanScore', async () => {
    const spec = defineEval({
      name: 'arithmetic',
      dataset: [
        { id: 'a', input: 1, expected: '2' },
        { id: 'b', input: 2, expected: '4' },
        { id: 'c', input: 3, expected: '6' },
      ],
      run: (n: number) => `${n * 2}`,
      graders: [exactMatch()],
    });
    const run = await runEval(spec);
    expect(run.cases).toHaveLength(3);
    expect(run.summary.passed).toBe(3);
    expect(run.summary.failed).toBe(0);
    expect(run.summary.meanScore).toBe(1);
    expect(run.gate.passed).toBe(true);
  });

  it('captures thrown errors per case without aborting the run', async () => {
    const spec = defineEval({
      name: 'flaky',
      dataset: [
        { id: 'ok', input: 'ok' },
        { id: 'boom', input: 'boom' },
      ],
      run: (s: string) => {
        if (s === 'boom') throw new Error('explode');
        return s;
      },
      graders: [exactMatch()],
    });
    const run = await runEval(spec);
    expect(run.summary.errored).toBe(1);
    expect(run.summary.passed).toBe(0);
    const boom = run.cases.find((c) => c.case.id === 'boom');
    expect(boom?.error?.kind).toBe('thrown');
    expect(boom?.error?.message).toBe('explode');
  });

  it('honours per-case timeoutMs and reports kind=timeout', async () => {
    const spec = defineEval({
      name: 'slow',
      dataset: [{ id: 'slow', input: 0, timeoutMs: 30 }],
      run: (_, ctx) =>
        new Promise<string>((resolve, reject) => {
          const t = setTimeout(() => resolve('done'), 200);
          ctx.abortSignal.addEventListener('abort', () => {
            clearTimeout(t);
            const reason = ctx.abortSignal.reason;
            reject(reason instanceof Error ? reason : new Error(String(reason)));
          });
        }),
      graders: [exactMatch()],
    });
    const run = await runEval(spec);
    const c = run.cases[0];
    expect(c).toBeDefined();
    expect(c?.error?.kind).toBe('timeout');
  });

  it('captures budgetUsage when spec.budget is set', async () => {
    const spec = defineEval({
      name: 'budget',
      dataset: [{ id: 'one', input: 1 }],
      run: () => 'x',
      graders: [],
      budget: { maxLlmCalls: 10 },
    });
    const run = await runEval(spec);
    expect(run.cases[0]?.budgetUsage).toBeDefined();
    expect(run.cases[0]?.scopeId).toBeDefined();
  });

  it('non-contributing graders are reported but do not affect meanScore', async () => {
    const noisy: Grader = {
      name: 'noisy',
      contributes: false,
      grade: () => ({ score: 0, passed: false, reason: 'always fails for diagnostics' }),
    };
    const spec = defineEval({
      name: 'mixed',
      dataset: [{ id: 'a', input: 'x', expected: 'x' }],
      run: (s: string) => s,
      graders: [exactMatch(), noisy, latency({ maxMs: 5000 })],
    });
    const run = await runEval(spec);
    expect(run.summary.meanScore).toBe(1);
    expect(run.cases[0]?.passed).toBe(true);
    expect(run.cases[0]?.graders.find((g) => g.grader === 'noisy')?.contributes).toBe(false);
  });

  it('catches grader exceptions without crashing the run', async () => {
    const broken: Grader = {
      name: 'broken',
      grade: () => {
        throw new Error('bad grader');
      },
    };
    const spec = defineEval({
      name: 'broken-graders',
      dataset: [{ id: 'a', input: 'x' }],
      run: (s: string) => s,
      graders: [broken],
    });
    const run = await runEval(spec);
    const entry = run.cases[0]?.graders[0];
    expect(entry).toBeDefined();
    expect(entry?.error?.message).toBe('bad grader');
    expect(entry?.result.passed).toBe(false);
    expect(run.cases[0]?.passed).toBe(false);
  });

  it('respects concurrency by running cases in parallel', async () => {
    const sleeps = [50, 50, 50, 50];
    const spec = defineEval({
      name: 'parallel',
      dataset: sleeps.map((ms, i) => ({ id: `s${i}`, input: ms })),
      run: (ms: number) => new Promise<number>((r) => setTimeout(() => r(ms), ms)),
      graders: [],
    });
    const t0 = Date.now();
    const run = await runEval(spec, { concurrency: 4 });
    const elapsed = Date.now() - t0;
    // 4 cases × 50ms in parallel should land well under 200ms.
    expect(elapsed).toBeLessThan(180);
    expect(run.cases).toHaveLength(4);
  });

  it('uses the gate from RunEvalOptions over the spec gate', async () => {
    const spec = defineEval({
      name: 'gate-override',
      dataset: [{ id: 'a', input: 'x', expected: 'y' }],
      run: (s: string) => s,
      graders: [exactMatch()],
      gate: { kind: 'meanScore', min: 0.95 },
    });
    const strict = await runEval(spec);
    expect(strict.gate.passed).toBe(false);
    const lax = await runEval(spec, { gate: { kind: 'meanScore', min: 0 } });
    expect(lax.gate.passed).toBe(true);
  });

  it('onCaseFinish is invoked once per case; errors swallowed', async () => {
    const seen: string[] = [];
    const spec = defineEval({
      name: 'progress',
      dataset: [
        { id: 'a', input: 1 },
        { id: 'b', input: 2 },
      ],
      run: (n: number) => `${n}`,
      graders: [],
    });
    await runEval(spec, {
      onCaseFinish: (r) => {
        seen.push(r.case.id ?? '?');
        throw new Error('reporter exploded — should be swallowed');
      },
    });
    expect(seen.sort()).toEqual(['a', 'b']);
  });
});
