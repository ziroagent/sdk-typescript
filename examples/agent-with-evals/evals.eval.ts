/**
 * Eval spec for the support-intent classifier. This file is consumed by
 *   `ziroagent eval ./evals.eval.ts --gate 0.95`
 * (see `pnpm eval:cli`). It also re-exports the spec so `eval-runner.ts`
 * can drive it programmatically without the CLI.
 */
import { contains, costBudget, defineEval, exactMatch, latency } from '@ziro-agent/eval';
import { classifyIntent, type Intent } from './classifier.js';

const dataset: ReadonlyArray<{
  id: string;
  input: string;
  expected: Intent;
}> = [
  { id: 'refund-1', input: 'I want my money back, this is broken.', expected: 'refund' },
  { id: 'refund-2', input: 'How do I request a refund for order #128?', expected: 'refund' },
  {
    id: 'ship-1',
    input: 'Where is my package? It was supposed to arrive yesterday.',
    expected: 'shipping',
  },
  {
    id: 'ship-2',
    input: 'Tracking number says delivered but I have nothing.',
    expected: 'shipping',
  },
  { id: 'tech-1', input: 'The app keeps crashing when I tap the cart icon.', expected: 'tech' },
  { id: 'tech-2', input: 'Login button does nothing after the latest update.', expected: 'tech' },
  { id: 'other-1', input: 'Do you sponsor open-source projects?', expected: 'other' },
  { id: 'other-2', input: 'What are your office hours in Hanoi?', expected: 'other' },
];

export default defineEval({
  name: 'support-intent-classifier',
  description: 'Classify customer messages into one of 4 buckets — must be cheap and fast.',
  dataset,
  run: async (input: string) => classifyIntent(input),
  graders: [exactMatch(), costBudget({ maxUsd: 0.001 }), latency({ maxMs: 200 })],
  // RFC 0001 budget continuity: every case runs in its own scope.
  budget: { maxUsd: 0.05, maxLlmCalls: 0 },
  gate: { kind: 'meanScore', min: 0.95 },
});

/** Second spec to demonstrate `passRate` gating + a `contains` grader. */
export const noPiiLeaks = defineEval({
  name: 'no-pii-in-replies',
  description:
    'Stub spec showing a `contains` grader used in negate mode to check the ' +
    'classifier never echoes the literal input back (a common privacy bug).',
  dataset: dataset.map((c) => ({ ...c, expected: c.input })),
  run: async (input: string) => classifyIntent(input),
  graders: [contains({ negate: true })],
  gate: { kind: 'passRate', min: 1.0 },
});
