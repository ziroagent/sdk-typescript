/**
 * Quick-start: run the support-intent eval programmatically and print the
 * gate result. For a richer report (per-case lines, JSON output, CLI gate)
 * see:
 *   pnpm eval         # programmatic, full text report
 *   pnpm eval:cli     # via `ziroagent eval ./evals.eval.ts --gate 0.95`
 */
import { runEval } from '@ziro-agent/eval';
import spec from './evals.eval.js';

const run = await runEval(spec);

const passed = run.gate.passed ? 'PASS' : 'FAIL';
const score = run.summary.meanScore.toFixed(3);
console.log(`${spec.name}: ${passed} (mean ${score}, ${run.summary.passed}/${run.summary.total})`);
console.log(`Gate: ${run.gate.reason}`);

process.exit(run.gate.passed ? 0 : 1);
