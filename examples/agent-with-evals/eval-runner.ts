/**
 * Programmatic driver for the eval — equivalent to `pnpm eval:cli` but
 * wires the runner into your own code so you can post results to Slack,
 * persist them to S3, etc.
 *
 * Run with:  pnpm eval
 */
import { formatTextReport, runEval } from '@ziro-agent/eval';
import spec, { noPiiLeaks } from './evals.eval.js';

const intentRun = await runEval(spec, { concurrency: 4 });
process.stdout.write(formatTextReport(intentRun));

const piiRun = await runEval(noPiiLeaks);
process.stdout.write(formatTextReport(piiRun));

const allPassed = intentRun.gate.passed && piiRun.gate.passed;
process.exit(allPassed ? 0 : 1);
