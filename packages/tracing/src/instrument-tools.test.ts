import { afterEach, describe, expect, it } from 'vitest';
import { ATTR } from './attributes.js';
import { instrumentTool, instrumentTools } from './instrument-tools.js';
import { type SpanLike, setTracer, type ZiroTracer } from './tracer.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  ended: boolean;
}

function recordingTracer(): ZiroTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const span = (name: string): SpanLike => {
    const rec: RecordedSpan = { name, attributes: {}, ended: false };
    spans.push(rec);
    return {
      setAttribute(k, v) {
        rec.attributes[k] = v;
      },
      setAttributes(a) {
        Object.assign(rec.attributes, a);
      },
      setStatus() {},
      recordException() {},
      addEvent() {},
      end() {
        rec.ended = true;
      },
    };
  };
  return {
    spans,
    startSpan(n) {
      return span(n);
    },
    async withSpan(n, fn) {
      const s = span(n);
      try {
        return await fn(s);
      } finally {
        s.end();
      }
    },
  };
}

afterEach(() => setTracer(null));

describe('instrumentTool', () => {
  it('opens a span per execute() call and tags ToolName', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const wrapped = instrumentTool({
      name: 'add',
      execute: ({ a, b }: { a: number; b: number }) => a + b,
    });
    const out = await wrapped.execute({ a: 1, b: 2 });
    expect(out).toBe(3);
    expect(tracer.spans[0]?.name).toBe('gen_ai.tool.add');
    expect(tracer.spans[0]?.attributes[ATTR.ToolName]).toBe('add');
    expect(tracer.spans[0]?.ended).toBe(true);
  });

  it('marks span as errored when execute throws', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const wrapped = instrumentTool({
      name: 'fail',
      execute: () => {
        throw new Error('nope');
      },
    });
    await expect(wrapped.execute(undefined)).rejects.toThrow('nope');
    expect(tracer.spans[0]?.attributes[ATTR.ToolError]).toBe(true);
  });

  it('uses custom spanName and capability attributes when present', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const wrapped = instrumentTool({
      name: 'x',
      spanName: 'ziro.sandbox.execute',
      capabilities: ['network', 'fs:write:/tmp'],
      traceAttributes: { 'ziroagent.browser.operation': 'goto' },
      execute: () => 1,
    });
    await wrapped.execute(undefined);
    expect(tracer.spans[0]?.name).toBe('ziro.sandbox.execute');
    expect(tracer.spans[0]?.attributes[ATTR.ToolCapabilities]).toEqual([
      'network',
      'fs:write:/tmp',
    ]);
    expect(tracer.spans[0]?.attributes['ziroagent.browser.operation']).toBe('goto');
  });

  it('instrumentTools wraps every tool in a record', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const tools = instrumentTools({
      a: { name: 'a', execute: () => 1 },
      b: { name: 'b', execute: () => 2 },
    });
    await tools.a.execute(undefined);
    await tools.b.execute(undefined);
    expect(tracer.spans.map((s) => s.name)).toEqual(['gen_ai.tool.a', 'gen_ai.tool.b']);
  });
});
