import { describe, expect, it } from 'vitest';
import { evalSpecFromJsonDataset } from './json-dataset.js';
import { runEval } from './run-eval.js';

describe('evalSpecFromJsonDataset', () => {
  it('builds a runnable spec with modelText runKind', async () => {
    const spec = evalSpecFromJsonDataset({
      ziroEvalDataset: 1,
      name: 'json-smoke',
      runKind: 'modelText',
      cases: [
        {
          id: 'a',
          input: { prompt: 'x' },
          expected: 'hello',
          modelText: 'hello',
        },
      ],
      graders: [{ kind: 'exactMatch' }],
      gate: { kind: 'meanScore', min: 1 },
    });
    const run = await runEval(spec);
    expect(run.gate.passed).toBe(true);
    expect(run.cases[0]?.passed).toBe(true);
  });

  it('rejects unsupported grader', () => {
    expect(() =>
      evalSpecFromJsonDataset({
        ziroEvalDataset: 1,
        name: 'bad',
        runKind: 'modelText',
        cases: [{ id: 'a', input: {}, expected: 'x', modelText: 'x' }],
        graders: [{ kind: 'llmJudge' }],
      }),
    ).toThrow(/unsupported grader kind/);
  });

  it('fails gate when modelText mismatches expected', async () => {
    const spec = evalSpecFromJsonDataset({
      ziroEvalDataset: 1,
      name: 'json-fail',
      runKind: 'modelText',
      cases: [
        {
          id: 'a',
          input: { prompt: 'x' },
          expected: 'want',
          modelText: 'got',
        },
      ],
      graders: [{ kind: 'exactMatch' }],
      gate: { kind: 'meanScore', min: 1 },
    });
    const run = await runEval(spec);
    expect(run.gate.passed).toBe(false);
  });
});
