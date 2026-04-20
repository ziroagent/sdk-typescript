import { type BudgetSpec, generateText, type LanguageModel, withBudget } from '@ziro-agent/core';
import type { Grader, GraderResult } from '../types.js';

export interface LlmJudgeOptions<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  model: LanguageModel;
  /**
   * Either a static rubric string or a function that builds one from the case.
   * The rubric is concatenated into the user prompt; the system prompt
   * instructs the judge to reply with strict JSON.
   */
  rubric: string | ((input: TInput, output: TOutput, expected: TExpected | undefined) => string);
  /**
   * Override the system prompt. The default forces a strict JSON shape:
   *   {"score": <0..1>, "reason": "<brief>"}
   * Custom prompts must still ask for the same JSON shape — the parser is fixed.
   */
  systemPrompt?: string;
  /**
   * Subject the judge model itself to a budget. Strongly recommended in CI;
   * a runaway judge can rack up cost just as quickly as the agent under test.
   */
  budget?: BudgetSpec;
  /** Display name for the grader (e.g. "factuality"). Default: `llmJudge`. */
  name?: string;
}

const DEFAULT_SYSTEM = [
  'You are a strict, impartial grader.',
  'Score the output on a 0.0 to 1.0 scale where 1.0 is a perfect answer.',
  'Reply with ONLY a single JSON object on one line, no prose:',
  '{"score": <number 0..1>, "reason": "<one sentence>"}',
].join(' ');

/**
 * LLM-as-judge grader. Sends a structured prompt to a `LanguageModel` and
 * parses `{score, reason}` from its reply. Treats parse failures and
 * out-of-range scores as `score: 0`. Reports the raw judge text under
 * `details.rawResponse` for debugging.
 */
export function llmJudge<TInput = unknown, TOutput = unknown, TExpected = unknown>(
  opts: LlmJudgeOptions<TInput, TOutput, TExpected>,
): Grader<TInput, TOutput, TExpected> {
  const systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM;
  const name = opts.name ?? 'llmJudge';
  return {
    name,
    async grade(input, output, ctx): Promise<GraderResult> {
      const expected = ctx.case.expected;
      const rubric =
        typeof opts.rubric === 'function' ? opts.rubric(input, output, expected) : opts.rubric;

      const userPrompt = [
        `Rubric: ${rubric}`,
        '',
        `Input:\n${stringify(input)}`,
        '',
        `Expected:\n${expected === undefined ? '(none)' : stringify(expected)}`,
        '',
        `Output:\n${stringify(output)}`,
      ].join('\n');

      const call = () =>
        generateText({
          model: opts.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          maxTokens: 200,
          temperature: 0,
        });

      const result = opts.budget ? await withBudget(opts.budget, call) : await call();

      const parsed = parseJudgeResponse(result.text);
      if (!parsed.ok) {
        return {
          score: 0,
          passed: false,
          reason: `judge response could not be parsed: ${parsed.error}`,
          details: { rawResponse: result.text, judgeUsage: result.usage },
        };
      }
      const score = clamp01(parsed.value.score);
      return {
        score,
        passed: score >= 0.5,
        reason: parsed.value.reason ?? '(no reason provided)',
        details: { rawResponse: result.text, judgeUsage: result.usage, judgeScore: score },
      };
    },
  };
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function clamp01(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

interface ParsedJudge {
  score: number;
  reason?: string;
}

function parseJudgeResponse(
  text: string,
): { ok: true; value: ParsedJudge } | { ok: false; error: string } {
  // Strip common code-fence wrappers some models emit despite the system prompt.
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Find the first { and the matching last } so a chatty judge that adds
  // a sentence either side still parses.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: 'no JSON object found in response' };
  }
  const slice = trimmed.slice(start, end + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(slice);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'response is not a JSON object' };
  }
  const obj = raw as { score?: unknown; reason?: unknown };
  if (typeof obj.score !== 'number') {
    return { ok: false, error: 'response is missing numeric `score`' };
  }
  const out: ParsedJudge = { score: obj.score };
  if (typeof obj.reason === 'string') out.reason = obj.reason;
  return { ok: true, value: out };
}
