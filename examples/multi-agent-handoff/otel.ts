/**
 * Optional console tracer loaded via `tsx --import ./otel.ts index.ts`.
 *
 * To keep this example install-light, we wire a tiny in-process tracer
 * that prints every span on stdout — no OpenTelemetry packages needed.
 *
 * To swap in a real OTel exporter:
 *
 *   1. Install:
 *        pnpm add @opentelemetry/api @opentelemetry/sdk-trace-node \
 *                 @opentelemetry/exporter-trace-otlp-http \
 *                 @opentelemetry/resources @opentelemetry/semantic-conventions
 *
 *   2. Replace the body of this file with:
 *
 *      ```ts
 *      import { trace } from '@opentelemetry/api';
 *      import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
 *      import { resourceFromAttributes } from '@opentelemetry/resources';
 *      import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
 *      import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
 *      import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
 *      import { createOtelTracer, setTracer } from '@ziro-agent/tracing';
 *
 *      const provider = new NodeTracerProvider({
 *        resource: resourceFromAttributes({
 *          [ATTR_SERVICE_NAME]: 'multi-agent-handoff-demo',
 *        }),
 *        spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
 *      });
 *      provider.register();
 *      setTracer(createOtelTracer(trace.getTracer('@ziro-agent/example-multi-agent-handoff')));
 *      ```
 */

import { type SpanLike, setTracer, type ZiroTracer } from '@ziro-agent/tracing';

function consoleTracer(): ZiroTracer {
  let id = 0;
  const make = (name: string): SpanLike => {
    const spanId = ++id;
    const start = Date.now();
    const attrs: Record<string, unknown> = {};
    let status: 'ok' | 'error' | 'unset' = 'unset';
    let errMsg: string | undefined;
    return {
      setAttribute(k, v) {
        attrs[k] = v;
      },
      setAttributes(a) {
        Object.assign(attrs, a);
      },
      setStatus(s) {
        status = s.code === 1 ? 'ok' : s.code === 2 ? 'error' : 'unset';
        errMsg = s.message;
      },
      recordException(e) {
        errMsg = e instanceof Error ? e.message : String(e);
      },
      addEvent(name, eventAttrs) {
        // eslint-disable-next-line no-console
        console.log(`  [span#${spanId}] event: ${name}`, eventAttrs ?? '');
      },
      end() {
        const dur = Date.now() - start;
        // eslint-disable-next-line no-console
        console.log(
          `  [span#${spanId}] ${name} (${dur}ms, ${status})` +
            (errMsg ? ` err=${errMsg}` : '') +
            (Object.keys(attrs).length ? `\n    ${JSON.stringify(attrs)}` : ''),
        );
      },
    };
  };
  return {
    startSpan(n) {
      return make(n);
    },
    async withSpan(n, fn) {
      const s = make(n);
      try {
        const out = await fn(s);
        s.setStatus({ code: 1 });
        return out;
      } catch (err) {
        s.setStatus({
          code: 2,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        s.end();
      }
    },
  };
}

setTracer(consoleTracer());
