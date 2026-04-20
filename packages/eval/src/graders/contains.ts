import type { Grader, GraderResult } from '../types.js';

export interface ContainsOptions {
  caseSensitive?: boolean;
  /** When true, fail if the substring IS present. */
  negate?: boolean;
}

/**
 * Pass when the stringified output contains the case's `expected` value as a
 * substring. Useful for "the answer should mention X" assertions where you
 * don't want to pin the entire output.
 */
export function contains(opts: ContainsOptions = {}): Grader<unknown, unknown, unknown> {
  const { caseSensitive = true, negate = false } = opts;
  return {
    name: 'contains',
    grade(_input, output, ctx): GraderResult {
      const expected = ctx.case.expected;
      if (expected === undefined || expected === null) {
        return {
          score: 0,
          passed: false,
          reason: 'contains requires `case.expected` to be set to a string',
        };
      }
      const haystack = typeof output === 'string' ? output : JSON.stringify(output);
      const needle = typeof expected === 'string' ? expected : JSON.stringify(expected);
      const a = caseSensitive ? haystack : haystack.toLowerCase();
      const b = caseSensitive ? needle : needle.toLowerCase();
      const present = a.includes(b);
      const passed = negate ? !present : present;
      return {
        score: passed ? 1 : 0,
        passed,
        reason: passed
          ? negate
            ? `output correctly omits "${needle}"`
            : `output contains "${needle}"`
          : negate
            ? `output unexpectedly contains "${needle}"`
            : `output is missing "${needle}"`,
      };
    },
  };
}
