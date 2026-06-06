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

  it('requires judgeModel when llmJudge grader is used', () => {
    expect(() =>
      evalSpecFromJsonDataset({
        ziroEvalDataset: 1,
        name: 'bad',
        runKind: 'modelText',
        cases: [{ id: 'a', input: {}, expected: 'x', modelText: 'x' }],
        graders: [{ kind: 'llmJudge', rubric: 'Is output acceptable?' }],
      }),
    ).toThrow(/judgeModel/);
  });

  it('accepts llmJudge with mock judgeModel', async () => {
    const spec = evalSpecFromJsonDataset({
      ziroEvalDataset: 1,
      name: 'json-llm-judge',
      runKind: 'modelText',
      judgeModel: { kind: 'mock', response: '{"score":1,"reason":"pass"}' },
      cases: [
        {
          id: 'a',
          input: { q: 'hi' },
          expected: 'ok',
          modelText: 'hello there',
        },
      ],
      graders: [{ kind: 'llmJudge', rubric: 'Greeting is polite.' }],
      gate: { kind: 'meanScore', min: 0.5 },
    });
    const run = await runEval(spec);
    expect(run.gate.passed).toBe(true);
  });

  it('accepts contains grader with substring expected', async () => {
    const spec = evalSpecFromJsonDataset({
      ziroEvalDataset: 1,
      name: 'json-contains',
      runKind: 'modelText',
      cases: [
        {
          id: 'a',
          input: {},
          expected: 'world',
          modelText: 'hello world',
        },
      ],
      graders: [{ kind: 'contains', caseSensitive: true }],
      gate: { kind: 'meanScore', min: 1 },
    });
    const run = await runEval(spec);
    expect(run.gate.passed).toBe(true);
  });

  it('accepts regex grader with pattern', async () => {
    const spec = evalSpecFromJsonDataset({
      ziroEvalDataset: 1,
      name: 'json-regex',
      runKind: 'modelText',
      cases: [
        {
          id: 'a',
          input: {},
          expected: '',
          modelText: 'order 42 confirmed',
        },
      ],
      graders: [{ kind: 'regex', pattern: '\\d+' }],
      gate: { kind: 'meanScore', min: 1 },
    });
    const run = await runEval(spec);
    expect(run.gate.passed).toBe(true);
  });

  it('runs multiple graders on one case', async () => {
    const spec = evalSpecFromJsonDataset({
      ziroEvalDataset: 1,
      name: 'json-multi',
      runKind: 'modelText',
      cases: [
        {
          id: 'a',
          input: {},
          expected: 'order',
          modelText: 'order 7 shipped',
        },
      ],
      graders: [{ kind: 'contains' }, { kind: 'regex', pattern: '\\d' }],
      gate: { kind: 'meanScore', min: 1 },
    });
    const run = await runEval(spec);
    expect(run.gate.passed).toBe(true);
  });

  it('rejects empty regex pattern', () => {
    expect(() =>
      evalSpecFromJsonDataset({
        ziroEvalDataset: 1,
        name: 'bad-re',
        runKind: 'modelText',
        cases: [{ id: 'a', input: {}, expected: 'x', modelText: 'x' }],
        graders: [{ kind: 'regex', pattern: '' }],
      }),
    ).toThrow(/non-empty string "pattern"/);
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
