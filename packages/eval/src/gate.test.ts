import { describe, expect, it } from 'vitest';
import { evaluateGate } from './gate.js';
import type { EvalRun } from './types.js';

const baseRun: Omit<EvalRun, 'gate' | 'spec'> = {
  startedAt: '',
  finishedAt: '',
  durationMs: 0,
  cases: [],
  summary: { total: 0, passed: 0, failed: 0, errored: 0, meanScore: 0 },
};

const make = (overrides: Partial<EvalRun>): EvalRun =>
  ({
    ...baseRun,
    spec: { name: 't', gate: { kind: 'meanScore', min: 0 } },
    gate: { passed: false, reason: '' },
    ...overrides,
  }) as EvalRun;

describe('evaluateGate', () => {
  it('meanScore — passes when score >= min', () => {
    const r = make({ summary: { total: 1, passed: 1, failed: 0, errored: 0, meanScore: 0.95 } });
    expect(evaluateGate(r, { kind: 'meanScore', min: 0.95 }).passed).toBe(true);
    expect(evaluateGate(r, { kind: 'meanScore', min: 0.96 }).passed).toBe(false);
  });

  it('passRate — fraction of passed cases', () => {
    const r = make({ summary: { total: 10, passed: 9, failed: 1, errored: 0, meanScore: 0.9 } });
    expect(evaluateGate(r, { kind: 'passRate', min: 0.9 }).passed).toBe(true);
    expect(evaluateGate(r, { kind: 'passRate', min: 0.95 }).passed).toBe(false);
  });

  it('every — all cases must beat the per-grader threshold', () => {
    const r = make({
      cases: [
        {
          case: { id: 'a', input: null },
          durationMs: 0,
          graders: [
            {
              grader: 'judge',
              weight: 1,
              contributes: true,
              result: { score: 0.9, passed: true },
              durationMs: 0,
            },
          ],
          meanScore: 0.9,
          passed: true,
        },
        {
          case: { id: 'b', input: null },
          durationMs: 0,
          graders: [
            {
              grader: 'judge',
              weight: 1,
              contributes: true,
              result: { score: 0.6, passed: false },
              durationMs: 0,
            },
          ],
          meanScore: 0.6,
          passed: false,
        },
      ],
    });
    expect(evaluateGate(r, { kind: 'every', grader: 'judge', min: 0.8 }).passed).toBe(false);
    expect(evaluateGate(r, { kind: 'every', grader: 'judge', min: 0.5 }).passed).toBe(true);
    expect(evaluateGate(r, { kind: 'every', grader: 'missing', min: 0.5 }).passed).toBe(false);
  });

  it('custom — calls the user check', () => {
    const r = make({});
    expect(
      evaluateGate(r, { kind: 'custom', check: () => ({ passed: true, reason: 'ok' }) }).passed,
    ).toBe(true);
    expect(
      evaluateGate(r, {
        kind: 'custom',
        check: () => {
          throw new Error('blew up');
        },
      }).reason,
    ).toMatch(/blew up/);
  });
});
