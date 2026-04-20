import type { Grader, GraderResult } from '../types.js';

export interface LatencyOptions {
  /** Hard ceiling — fail the case when it goes over. */
  maxMs?: number;
  /** Reported only — does not affect this case's score on its own. */
  p50Ms?: number;
  /** Reported only — does not affect this case's score on its own. */
  p95Ms?: number;
}

/**
 * Pass when the per-case wall-clock duration stays under `maxMs`. `p50Ms` /
 * `p95Ms` are recorded into `details` for downstream aggregation but do not
 * affect *this* case's score (percentiles are a property of the run, not a
 * single case). Set `contributes: false` on the grader at the call site if
 * you want latency to be reported but not gated.
 */
export function latency(opts: LatencyOptions = {}): Grader<unknown, unknown, unknown> {
  return {
    name: 'latency',
    grade(_input, _output, ctx): GraderResult {
      const ms = ctx.durationMs;
      if (opts.maxMs === undefined) {
        return {
          score: 1,
          passed: true,
          reason: `${ms} ms (no maxMs set)`,
          details: { durationMs: ms, ...opts },
        };
      }
      const passed = ms <= opts.maxMs;
      return {
        score: passed ? 1 : 0,
        passed,
        reason: passed ? `${ms} ms ≤ ${opts.maxMs} ms` : `${ms} ms > ${opts.maxMs} ms`,
        details: { durationMs: ms, ...opts },
      };
    },
  };
}
