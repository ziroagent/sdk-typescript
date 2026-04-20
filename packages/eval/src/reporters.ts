import type { EvalCaseResult, EvalRun } from './types.js';

/**
 * Pretty-print an `EvalRun` as a multi-line text report suitable for terminal
 * output. Stable format — change carefully, downstream tools may regex it.
 */
export function formatTextReport(run: EvalRun): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`Eval: ${run.spec.name}${run.spec.description ? ` — ${run.spec.description}` : ''}`);
  lines.push(`Started:  ${run.startedAt}`);
  lines.push(`Finished: ${run.finishedAt}  (${run.durationMs} ms)`);
  lines.push('');
  lines.push(
    `Cases: ${run.summary.total}  passed=${run.summary.passed}  failed=${run.summary.failed}  errored=${run.summary.errored}`,
  );
  lines.push(`Mean score: ${formatScore(run.summary.meanScore)}`);
  if (run.summary.totalCostUsd !== undefined) {
    lines.push(`Total cost: $${run.summary.totalCostUsd.toFixed(4)} USD`);
  }
  if (run.summary.totalTokens !== undefined) {
    lines.push(`Total tokens: ${run.summary.totalTokens}`);
  }
  lines.push('');
  lines.push('Per-case results:');
  for (const c of run.cases) {
    lines.push(formatCase(c));
  }
  lines.push('');
  lines.push(
    `Gate (${run.spec.gate.kind}): ${run.gate.passed ? 'PASS' : 'FAIL'} — ${run.gate.reason}`,
  );
  lines.push('');
  return lines.join('\n');
}

function formatCase(c: EvalCaseResult): string {
  const head = `  ${c.passed ? '✓' : '✗'} ${c.case.id ?? '?'} — score=${formatScore(c.meanScore)} (${c.durationMs} ms)`;
  const sub: string[] = [];
  if (c.error) {
    sub.push(`      ! ${c.error.kind}: ${c.error.name}: ${c.error.message}`);
  }
  for (const g of c.graders) {
    const mark = g.error ? '!' : g.result.passed ? '·' : 'x';
    const tag = g.contributes ? '' : ' [info]';
    const reason = g.error ? `grader threw: ${g.error.message}` : (g.result.reason ?? '');
    sub.push(
      `      ${mark} ${g.grader}${tag}: score=${formatScore(g.result.score)}${reason ? ` — ${reason}` : ''}`,
    );
  }
  return [head, ...sub].join('\n');
}

/**
 * Emit `EvalRun` as pretty-printed JSON. Stable shape — same fields every
 * release, additive changes only.
 */
export function toJSONReport(run: EvalRun): string {
  return JSON.stringify(run, null, 2);
}

function formatScore(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : 'NaN';
}
