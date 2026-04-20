/**
 * A trivial offline classifier used as the "function under test" in the
 * eval example. No LLM is involved so the demo runs with zero API keys
 * and zero cost — yet the grader pipeline (exactMatch / costBudget /
 * latency) still exercises the full RFC 0003 surface.
 *
 * In a real codebase this would be `await agent.run(...)` and `Intent`
 * would be parsed out of the agent's structured output.
 */
export type Intent = 'refund' | 'shipping' | 'tech' | 'other';

const RULES: Array<{ intent: Intent; pattern: RegExp }> = [
  { intent: 'refund', pattern: /\brefund|money back|charge ?back\b/i },
  { intent: 'shipping', pattern: /\bship|track|deliver|package|courier\b/i },
  { intent: 'tech', pattern: /\b(crash|bug|error|login|app|update|broken)\b/i },
];

export async function classifyIntent(input: string): Promise<Intent> {
  // Tiny artificial latency so `latency` grader has something to measure.
  await new Promise((r) => setTimeout(r, 5));
  for (const rule of RULES) {
    if (rule.pattern.test(input)) return rule.intent;
  }
  return 'other';
}
