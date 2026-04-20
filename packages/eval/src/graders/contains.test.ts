import { describe, expect, it } from 'vitest';
import type { GraderContext } from '../types.js';
import { contains } from './contains.js';

const ctx = (expected: unknown): GraderContext =>
  ({ case: { input: null, expected }, durationMs: 0 }) as GraderContext;

describe('contains grader', () => {
  it('passes when substring is present', async () => {
    const r = await contains().grade(null, 'hello world', ctx('world'));
    expect(r.passed).toBe(true);
  });

  it('fails when substring is missing', async () => {
    const r = await contains().grade(null, 'hello world', ctx('xyz'));
    expect(r.passed).toBe(false);
  });

  it('case-insensitive matching', async () => {
    const r = await contains({ caseSensitive: false }).grade(null, 'Hello', ctx('hello'));
    expect(r.passed).toBe(true);
  });

  it('negate flips the result', async () => {
    const r = await contains({ negate: true }).grade(null, 'hello', ctx('xyz'));
    expect(r.passed).toBe(true);
    const r2 = await contains({ negate: true }).grade(null, 'hello', ctx('hell'));
    expect(r2.passed).toBe(false);
  });
});
