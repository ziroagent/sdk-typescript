import { describe, expect, it } from 'vitest';
import type { GraderContext } from '../types.js';
import { exactMatch } from './exact-match.js';

const ctx = (expected: unknown): GraderContext =>
  ({ case: { input: null, expected }, durationMs: 0 }) as GraderContext;

describe('exactMatch grader', () => {
  it('passes on identical strings', async () => {
    const r = await exactMatch().grade(null, 'hello', ctx('hello'));
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('fails on mismatch', async () => {
    const r = await exactMatch().grade(null, 'hello', ctx('world'));
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
  });

  it('respects caseSensitive: false', async () => {
    const r = await exactMatch({ caseSensitive: false }).grade(null, 'Hello', ctx('hello'));
    expect(r.passed).toBe(true);
  });

  it('respects trim: true', async () => {
    const r = await exactMatch({ trim: true }).grade(null, '  hi  ', ctx('hi'));
    expect(r.passed).toBe(true);
  });

  it('JSON-stringifies non-string outputs', async () => {
    const r = await exactMatch().grade(null, { a: 1 }, ctx({ a: 1 }));
    expect(r.passed).toBe(true);
  });

  it('fails clearly when expected is missing', async () => {
    const r = await exactMatch().grade(null, 'x', ctx(undefined));
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/expected/);
  });
});
