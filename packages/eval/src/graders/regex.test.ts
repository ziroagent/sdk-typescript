import { describe, expect, it } from 'vitest';
import type { GraderContext } from '../types.js';
import { regex } from './regex.js';

const ctx = (): GraderContext => ({ case: { input: null }, durationMs: 0 }) as GraderContext;

describe('regex grader', () => {
  it('passes when pattern matches', async () => {
    const r = await regex(/^hello/).grade(null, 'hello world', ctx());
    expect(r.passed).toBe(true);
  });

  it('accepts string patterns', async () => {
    const r = await regex('\\d+').grade(null, 'order #123', ctx());
    expect(r.passed).toBe(true);
  });

  it('fails when pattern does not match', async () => {
    const r = await regex(/^foo/).grade(null, 'bar', ctx());
    expect(r.passed).toBe(false);
  });

  it('negate flips the result', async () => {
    const r = await regex(/^hello/, { negate: true }).grade(null, 'hello', ctx());
    expect(r.passed).toBe(false);
  });
});
