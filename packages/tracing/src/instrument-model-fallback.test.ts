import { describe, expect, it, vi } from 'vitest';
import { createModelFallbackOtelOnFallback } from './instrument-model-fallback.js';
import { type SpanLike, setTracer, type ZiroTracer } from './tracer.js';

describe('createModelFallbackOtelOnFallback', () => {
  it('records a span and exception when primary fails', () => {
    const recordException = vi.fn();
    const end = vi.fn();
    const addEvent = vi.fn();
    const setStatus = vi.fn();
    const span: SpanLike = {
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
      setStatus,
      recordException,
      addEvent,
      end,
    };
    const tracer: ZiroTracer = {
      startSpan: vi.fn(() => span),
      withSpan: vi.fn(),
    };
    setTracer(tracer);
    try {
      const { onFallback } = createModelFallbackOtelOnFallback();
      onFallback({
        attempt: 1,
        fromModelId: 'primary',
        toModelId: 'backup',
        error: new Error('503'),
      });
      expect(tracer.startSpan).toHaveBeenCalledWith(
        'ziro.model.fallback',
        expect.objectContaining({ kind: 'internal' }),
      );
      expect(recordException).toHaveBeenCalled();
      expect(end).toHaveBeenCalled();
    } finally {
      setTracer(null);
    }
  });
});
