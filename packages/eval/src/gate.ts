import type { EvalCaseResult, EvalGate, EvalRun } from './types.js';

const DEFAULT_GATE: EvalGate = { kind: 'meanScore', min: 0.95 };

export function defaultGate(): EvalGate {
  return DEFAULT_GATE;
}

/**
 * Centralised gate evaluation. Pure function over an `EvalRun`. Both
 * `runEval` and the `ziroagent eval` CLI call this so the semantics are
 * identical regardless of the entry point.
 */
export function evaluateGate(run: EvalRun, gate: EvalGate): { passed: boolean; reason: string } {
  switch (gate.kind) {
    case 'meanScore': {
      const passed = run.summary.meanScore >= gate.min;
      return {
        passed,
        reason: `meanScore ${formatScore(run.summary.meanScore)} ${passed ? '≥' : '<'} ${gate.min}`,
      };
    }
    case 'passRate': {
      const rate = run.summary.total === 0 ? 0 : run.summary.passed / run.summary.total;
      const passed = rate >= gate.min;
      return {
        passed,
        reason: `passRate ${formatScore(rate)} (${run.summary.passed}/${run.summary.total}) ${
          passed ? '≥' : '<'
        } ${gate.min}`,
      };
    }
    case 'every': {
      const cases = run.cases as ReadonlyArray<EvalCaseResult>;
      const offending: string[] = [];
      let any = false;
      for (const c of cases) {
        const entry = c.graders.find((g) => g.grader === gate.grader);
        if (!entry) continue;
        any = true;
        if (entry.result.score < gate.min) {
          offending.push(`${c.case.id ?? c.case.name ?? '?'}=${formatScore(entry.result.score)}`);
        }
      }
      if (!any) {
        return {
          passed: false,
          reason: `gate references grader "${gate.grader}" which no case used`,
        };
      }
      const passed = offending.length === 0;
      return {
        passed,
        reason: passed
          ? `every "${gate.grader}" ≥ ${gate.min}`
          : `${offending.length} case(s) below ${gate.min}: ${offending.join(', ')}`,
      };
    }
    case 'custom': {
      try {
        const out = gate.check(run);
        return {
          passed: !!out.passed,
          reason: out.reason ?? (out.passed ? 'custom gate passed' : 'custom gate failed'),
        };
      } catch (err) {
        return {
          passed: false,
          reason: `custom gate threw: ${(err as Error).message}`,
        };
      }
    }
  }
}

function formatScore(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : 'NaN';
}
