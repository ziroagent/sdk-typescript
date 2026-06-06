import { parse } from 'yaml';
import { evalSpecFromJsonDataset } from './json-dataset.js';
import type { EvalSpec } from './types.js';

/**
 * Build an {@link EvalSpec} from YAML text (same schema as {@link evalSpecFromJsonDataset}).
 * Used by `ziroagent eval *.eval.yaml` / `*.eval.yml`.
 */
export function evalSpecFromYamlDataset(yamlText: string): EvalSpec {
  const doc = parse(yamlText);
  return evalSpecFromJsonDataset(doc);
}
