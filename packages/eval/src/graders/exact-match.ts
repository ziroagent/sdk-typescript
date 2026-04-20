import type { Grader, GraderResult } from '../types.js';

export interface ExactMatchOptions {
  caseSensitive?: boolean;
  trim?: boolean;
}

/**
 * Pass when the stringified output equals the case's `expected` value.
 * For non-string outputs both sides go through `JSON.stringify` first.
 */
export function exactMatch(opts: ExactMatchOptions = {}): Grader<unknown, unknown, unknown> {
  const { caseSensitive = true, trim = false } = opts;
  return {
    name: 'exactMatch',
    grade(_input, output, ctx): GraderResult {
      const expected = ctx.case.expected;
      if (expected === undefined) {
        return {
          score: 0,
          passed: false,
          reason: 'exactMatch requires `case.expected` to be set',
        };
      }
      const norm = (v: unknown) => {
        let s = typeof v === 'string' ? v : JSON.stringify(v);
        if (trim) s = s.trim();
        if (!caseSensitive) s = s.toLowerCase();
        return s;
      };
      const a = norm(output);
      const b = norm(expected);
      const passed = a === b;
      return {
        score: passed ? 1 : 0,
        passed,
        reason: passed
          ? 'output matches expected'
          : `output differs from expected (expected="${truncate(b)}", got="${truncate(a)}")`,
      };
    },
  };
}

function truncate(s: string, max = 80): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
