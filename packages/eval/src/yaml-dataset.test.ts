import { describe, expect, it } from 'vitest';
import { runEval } from './run-eval.js';
import { evalSpecFromYamlDataset } from './yaml-dataset.js';

describe('evalSpecFromYamlDataset', () => {
  it('parses YAML with same schema as JSON', async () => {
    const yaml = `
ziroEvalDataset: 1
name: yaml-smoke
runKind: modelText
cases:
  - id: a
    input: {}
    expected: ok
    modelText: ok
graders:
  - kind: exactMatch
gate:
  kind: meanScore
  min: 1
`;
    const spec = evalSpecFromYamlDataset(yaml);
    const run = await runEval(spec);
    expect(run.gate.passed).toBe(true);
  });
});
