import { describe, expect, it } from 'vitest';
import { exactMatch } from './graders/exact-match.js';
import { formatTextReport, toJSONReport } from './reporters.js';
import { defineEval, runEval } from './run-eval.js';

describe('reporters', () => {
  it('formatTextReport renders summary, per-case, and gate lines', async () => {
    const spec = defineEval({
      name: 'tiny',
      description: 'two-case demo',
      dataset: [
        { id: 'a', input: 'x', expected: 'x' },
        { id: 'b', input: 'x', expected: 'y' },
      ],
      run: (s: string) => s,
      graders: [exactMatch()],
      gate: { kind: 'meanScore', min: 0.5 },
    });
    const run = await runEval(spec);
    const out = formatTextReport(run);
    expect(out).toContain('Eval: tiny');
    expect(out).toContain('two-case demo');
    expect(out).toContain('passed=1');
    expect(out).toContain('failed=1');
    expect(out).toContain('  ✓ a —');
    expect(out).toContain('  ✗ b —');
    expect(out).toMatch(/Gate \(meanScore\): (PASS|FAIL)/);
  });

  it('toJSONReport produces valid JSON round-tripping the run', async () => {
    const spec = defineEval({
      name: 'json',
      dataset: [{ id: 'a', input: 'x', expected: 'x' }],
      run: (s: string) => s,
      graders: [exactMatch()],
    });
    const run = await runEval(spec);
    const json = toJSONReport(run);
    const parsed = JSON.parse(json);
    expect(parsed.spec.name).toBe('json');
    expect(parsed.summary.total).toBe(1);
    expect(parsed.cases[0].graders[0].grader).toBe('exactMatch');
  });
});
