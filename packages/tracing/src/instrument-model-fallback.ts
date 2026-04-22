import { ATTR, type AttrValue } from './attributes.js';
import { getTracer } from './tracer.js';

/**
 * Payload emitted by {@link modelFallback} from `@ziro-agent/middleware`
 * when the SDK switches to a backup {@link LanguageModel}.
 */
export type ModelFallbackEvent = {
  attempt: number;
  fromModelId: string;
  toModelId: string;
  error: unknown;
};

/**
 * Returns an `onFallback` callback suitable for the `modelFallback` middleware
 * from `@ziro-agent/middleware` after {@link setTracer}.
 *
 * Emits a short-lived internal span `ziro.model.fallback` plus attributes
 * {@link ATTR.ModelFallbackAttempt}, {@link ATTR.ModelFallbackFromModel},
 * {@link ATTR.ModelFallbackToModel}. The triggering error is attached via
 * {@link SpanLike.recordException} when possible.
 */
export function createModelFallbackOtelOnFallback(): {
  onFallback: (info: ModelFallbackEvent) => void;
} {
  return {
    onFallback(info: ModelFallbackEvent) {
      const tracer = getTracer();
      const attrs: Record<string, AttrValue> = {
        [ATTR.ModelFallbackAttempt]: info.attempt,
        [ATTR.ModelFallbackFromModel]: info.fromModelId,
        [ATTR.ModelFallbackToModel]: info.toModelId,
      };
      const span = tracer.startSpan('ziro.model.fallback', {
        kind: 'internal',
        attributes: attrs,
      });
      span.addEvent('ziro.model.fallback.activated', attrs);
      if (info.error instanceof Error) {
        span.recordException(info.error);
      } else {
        span.recordException(new Error(`fallback: ${String(info.error)}`));
      }
      span.setStatus({ code: 1 });
      span.end();
    },
  };
}
