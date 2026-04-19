import { afterEach, describe, expect, it } from 'vitest';
import { getTracer, noopSpan, noopTracer, setTracer, type ZiroTracer } from './tracer.js';

afterEach(() => setTracer(null));

describe('tracer registry', () => {
  it('defaults to no-op', async () => {
    expect(getTracer()).toBe(noopTracer);
    const out = await getTracer().withSpan('x', async () => 42);
    expect(out).toBe(42);
  });

  it('setTracer installs a custom tracer; null resets to no-op', () => {
    const custom: ZiroTracer = {
      startSpan: () => noopSpan,
      async withSpan(_n, fn) {
        return fn(noopSpan);
      },
    };
    setTracer(custom);
    expect(getTracer()).toBe(custom);
    setTracer(null);
    expect(getTracer()).toBe(noopTracer);
  });
});
