import { describe, expect, it } from 'vitest';
import type { GraderContext } from '../types.js';
import { latency } from './latency.js';

const ctx = (durationMs: number): GraderContext =>
  ({ case: { input: null }, durationMs }) as GraderContext;

describe('latency grader', () => {
  it('always passes when no maxMs is set', async () => {
    const r = await latency().grade(null, null, ctx(99999));
    expect(r.passed).toBe(true);
  });

  it('passes when under maxMs', async () => {
    const r = await latency({ maxMs: 1000 }).grade(null, null, ctx(500));
    expect(r.passed).toBe(true);
  });

  it('fails when over maxMs', async () => {
    const r = await latency({ maxMs: 1000 }).grade(null, null, ctx(1500));
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/1500/);
  });

  it('records durationMs in details', async () => {
    const r = await latency({ maxMs: 1000 }).grade(null, null, ctx(123));
    expect(r.details?.durationMs).toBe(123);
  });
});
