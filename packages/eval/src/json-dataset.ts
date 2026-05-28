import { contains } from './graders/contains.js';
import { exactMatch } from './graders/exact-match.js';
import { regex } from './graders/regex.js';
import { defineEval } from './run-eval.js';
import type { EvalCase, EvalGate, EvalSpec, Grader } from './types.js';

/** Supported JSON declarative eval format (CLI + tooling). */
export const JSON_EVAL_DATASET_VERSION = 1;

/** Shape of a `ziroEvalDataset` JSON document (v1). Exported for integrators / tooling. */
export interface JsonDatasetDoc {
  ziroEvalDataset: typeof JSON_EVAL_DATASET_VERSION;
  name: string;
  description?: string;
  /**
   * Each case supplies ground-truth `expected` for graders.
   * **`modelText`** — simulated model output for this case (`runKind: "modelText"`).
   */
  cases: ReadonlyArray<Record<string, unknown>>;
  /** Only `"modelText"` is supported in v1 — `run` returns each case's `modelText`. */
  runKind: 'modelText';
  /**
   * Graders for `runKind: "modelText"`. Supported `kind` values:
   * `exactMatch`, `contains` (optional `caseSensitive`, `negate`), `regex` (`pattern` string, optional `negate`).
   */
  graders: ReadonlyArray<Record<string, unknown>>;
  gate?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseGate(raw: unknown): EvalGate | undefined {
  if (raw === undefined) return { kind: 'meanScore', min: 1 };
  if (!isPlainObject(raw)) throw new Error('Invalid JSON eval: gate must be an object');
  const k = raw.kind;
  if (k === 'meanScore') {
    const min = raw.min;
    if (typeof min !== 'number' || !Number.isFinite(min)) {
      throw new Error('Invalid JSON eval: gate.meanScore requires numeric min');
    }
    return { kind: 'meanScore', min };
  }
  if (k === 'passRate') {
    const min = raw.min;
    if (typeof min !== 'number' || !Number.isFinite(min)) {
      throw new Error('Invalid JSON eval: gate.passRate requires numeric min');
    }
    return { kind: 'passRate', min };
  }
  throw new Error(`Invalid JSON eval: unsupported gate.kind "${String(k)}"`);
}

function parseGraders(raw: unknown): Grader[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Invalid JSON eval: graders must be a non-empty array');
  }
  const out: Grader[] = [];
  for (const g of raw) {
    if (!isPlainObject(g)) throw new Error('Invalid JSON eval: grader entry must be an object');
    const kind = g.kind;
    if (kind === 'exactMatch') {
      out.push(exactMatch());
      continue;
    }
    if (kind === 'contains') {
      const caseSensitive = g.caseSensitive;
      const negate = g.negate;
      out.push(
        contains({
          caseSensitive: typeof caseSensitive === 'boolean' ? caseSensitive : true,
          negate: typeof negate === 'boolean' ? negate : false,
        }),
      );
      continue;
    }
    if (kind === 'regex') {
      const pattern = g.pattern;
      if (typeof pattern !== 'string' || !pattern.length) {
        throw new Error('Invalid JSON eval: regex grader requires non-empty string "pattern"');
      }
      const negate = g.negate;
      try {
        out.push(regex(pattern, { negate: typeof negate === 'boolean' ? negate : false }));
      } catch {
        throw new Error(`Invalid JSON eval: invalid regex pattern: ${JSON.stringify(pattern)}`);
      }
      continue;
    }
    throw new Error(`Invalid JSON eval: unsupported grader kind "${String(kind)}"`);
  }
  return out;
}

/**
 * Build an {@link EvalSpec} from a JSON document (v1). Used by `ziroagent eval *.eval.json`.
 *
 * **`runKind: "modelText"`** — each case must include **`modelText`** (string): the synthetic
 * output of the run under test (e.g. fixture replay). Graders compare `modelText` to `expected`.
 * **Graders in JSON (v1):** `exactMatch`, `contains` (`caseSensitive?`, `negate?`), `regex` (`pattern`, `negate?`).
 */
export function evalSpecFromJsonDataset(doc: unknown): EvalSpec {
  if (!isPlainObject(doc)) throw new Error('Invalid JSON eval: root must be an object');
  if (doc.ziroEvalDataset !== JSON_EVAL_DATASET_VERSION) {
    throw new Error(`Invalid JSON eval: ziroEvalDataset must be ${JSON_EVAL_DATASET_VERSION}`);
  }
  const name = doc.name;
  if (typeof name !== 'string' || !name.trim()) throw new Error('Invalid JSON eval: name required');

  const runKind = doc.runKind;
  if (runKind !== 'modelText') {
    throw new Error('Invalid JSON eval: runKind must be "modelText"');
  }

  const casesRaw = doc.cases;
  if (!Array.isArray(casesRaw) || casesRaw.length === 0) {
    throw new Error('Invalid JSON eval: cases must be a non-empty array');
  }

  const dataset: EvalCase[] = casesRaw.map((c, i) => {
    if (!isPlainObject(c)) throw new Error(`Invalid JSON eval: case[${i}] must be an object`);
    const id = typeof c.id === 'string' ? c.id : `case-${i}`;
    const modelText = c.modelText;
    if (typeof modelText !== 'string') {
      throw new Error(`Invalid JSON eval: case "${id}" requires string modelText`);
    }
    return {
      id,
      name: typeof c.name === 'string' ? c.name : id,
      input: c.input !== undefined ? c.input : {},
      expected: c.expected,
      metadata:
        isPlainObject(c.metadata) && c.metadata !== null
          ? { ...c.metadata, modelText }
          : { modelText },
    };
  });

  const graders = parseGraders(doc.graders);
  const gate = parseGate(doc.gate);
  const description = typeof doc.description === 'string' ? doc.description : undefined;

  return defineEval({
    name,
    description,
    dataset,
    run: (_input, ctx) => {
      const row = dataset.find((d) => d.id === ctx.caseId);
      const mt = row?.metadata?.modelText;
      if (typeof mt !== 'string') {
        throw new Error(`Internal: case ${ctx.caseId} missing modelText`);
      }
      return mt;
    },
    graders,
    gate,
  });
}
