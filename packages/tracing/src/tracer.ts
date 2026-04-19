import type { AttrValue } from './attributes.js';

/**
 * Subset of `@opentelemetry/api`'s `Span` we use. Declaring it locally lets
 * us treat OTel as an entirely optional peer dependency — the package works
 * out of the box with a no-op tracer if `@opentelemetry/api` is not installed.
 */
export interface SpanLike {
  setAttribute(key: string, value: AttrValue): void;
  setAttributes(attrs: Record<string, AttrValue>): void;
  setStatus(status: { code: 0 | 1 | 2; message?: string }): void;
  recordException(exception: unknown): void;
  addEvent(name: string, attributes?: Record<string, AttrValue>): void;
  end(): void;
}

export type SpanKind = 'internal' | 'client' | 'server' | 'producer' | 'consumer';

export interface StartSpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, AttrValue>;
}

/** Minimal tracer surface used throughout the SDK. */
export interface ZiroTracer {
  startSpan(name: string, options?: StartSpanOptions): SpanLike;
  /** Run `fn` inside a span, recording errors and ending the span automatically. */
  withSpan<T>(
    name: string,
    fn: (span: SpanLike) => T | Promise<T>,
    options?: StartSpanOptions,
  ): Promise<T>;
}

/** A span that records nothing; used when OTel is not configured. */
export const noopSpan: SpanLike = {
  setAttribute() {},
  setAttributes() {},
  setStatus() {},
  recordException() {},
  addEvent() {},
  end() {},
};

/** A tracer that creates only no-op spans. */
export const noopTracer: ZiroTracer = {
  startSpan() {
    return noopSpan;
  },
  async withSpan(_name, fn) {
    return await fn(noopSpan);
  },
};

let activeTracer: ZiroTracer = noopTracer;

/**
 * Install a tracer process-wide. Subsequent `getTracer()` calls return this
 * instance. Pass `null` to reset to the no-op tracer (useful in tests).
 */
export function setTracer(tracer: ZiroTracer | null): void {
  activeTracer = tracer ?? noopTracer;
}

export function getTracer(): ZiroTracer {
  return activeTracer;
}

const SPAN_KIND_MAP = {
  internal: 0,
  server: 1,
  client: 2,
  producer: 3,
  consumer: 4,
} as const;

const STATUS_OK = 1 as const;
const STATUS_ERROR = 2 as const;

/**
 * Build a {@link ZiroTracer} backed by an OpenTelemetry tracer. The signature
 * is loose (`unknown`) because we don't want a hard import on
 * `@opentelemetry/api`; pass `trace.getTracer('ziro')` here.
 */
export function createOtelTracer(otelTracer: unknown): ZiroTracer {
  const t = otelTracer as {
    startSpan(name: string, options?: { kind?: number; attributes?: Record<string, AttrValue> }): SpanLike;
  };
  return {
    startSpan(name, options) {
      const span = t.startSpan(name, {
        ...(options?.kind ? { kind: SPAN_KIND_MAP[options.kind] } : {}),
        ...(options?.attributes ? { attributes: options.attributes } : {}),
      });
      return span;
    },
    async withSpan(name, fn, options) {
      const span = this.startSpan(name, options);
      try {
        const out = await fn(span);
        span.setStatus({ code: STATUS_OK });
        return out;
      } catch (err) {
        span.recordException(err);
        span.setStatus({
          code: STATUS_ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        span.end();
      }
    },
  };
}
