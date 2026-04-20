import type { Grader, GraderResult } from '../types.js';

export interface RegexOptions {
  negate?: boolean;
}

/**
 * Pass when the stringified output matches `pattern`. Use a string for the
 * pattern if you want CLI / JSON-config provenance; the runner compiles it
 * with the default flags. Pass a RegExp directly to control flags yourself.
 */
export function regex(
  pattern: RegExp | string,
  opts: RegexOptions = {},
): Grader<unknown, unknown, unknown> {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  const { negate = false } = opts;
  return {
    name: 'regex',
    grade(_input, output): GraderResult {
      const haystack = typeof output === 'string' ? output : JSON.stringify(output);
      const matched = re.test(haystack);
      const passed = negate ? !matched : matched;
      return {
        score: passed ? 1 : 0,
        passed,
        reason: passed
          ? negate
            ? `output correctly does not match ${re}`
            : `output matches ${re}`
          : negate
            ? `output unexpectedly matches ${re}`
            : `output does not match ${re}`,
      };
    },
  };
}
