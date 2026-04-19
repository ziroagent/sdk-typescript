import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from '@ziro-ai/core';
import { afterEach, describe, expect, it } from 'vitest';
import { ATTR } from './attributes.js';
import { instrumentModel } from './instrument-model.js';
import { setTracer, type SpanLike, type ZiroTracer } from './tracer.js';

interface RecordedSpan {
  name: string;
  kind?: string;
  attributes: Record<string, unknown>;
  status?: { code: number; message?: string };
  ended: boolean;
  exceptions: unknown[];
}

function recordingTracer(): ZiroTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const make = (name: string, kind?: string): SpanLike => {
    const rec: RecordedSpan = { name, attributes: {}, ended: false, exceptions: [] };
    if (kind) rec.kind = kind;
    spans.push(rec);
    return {
      setAttribute(k, v) {
        rec.attributes[k] = v;
      },
      setAttributes(attrs) {
        Object.assign(rec.attributes, attrs);
      },
      setStatus(s) {
        rec.status = s;
      },
      recordException(e) {
        rec.exceptions.push(e);
      },
      addEvent() {},
      end() {
        rec.ended = true;
      },
    };
  };
  const tracer: ZiroTracer & { spans: RecordedSpan[] } = {
    spans,
    startSpan(name, options) {
      const s = make(name, options?.kind);
      if (options?.attributes) Object.assign(spans[spans.length - 1]?.attributes ?? {}, options.attributes);
      return s;
    },
    async withSpan(name, fn, options) {
      const span = this.startSpan(name, options);
      try {
        const out = await fn(span);
        span.setStatus({ code: 1 });
        return out;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: 2 });
        throw err;
      } finally {
        span.end();
      }
    },
  };
  return tracer;
}

const fakeResult: ModelGenerateResult = {
  text: 'hi',
  content: [{ type: 'text', text: 'hi' }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
};

const fakeModel: LanguageModel = {
  modelId: 'm1',
  provider: 'openai',
  async generate(_options: ModelCallOptions) {
    return fakeResult;
  },
  async stream() {
    return new ReadableStream<ModelStreamPart>({
      start(c) {
        c.enqueue({ type: 'text-delta', textDelta: 'hi' });
        c.enqueue({
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        });
        c.close();
      },
    });
  },
};

afterEach(() => setTracer(null));

describe('instrumentModel', () => {
  it('records request/response attributes for generate()', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const wrapped = instrumentModel(fakeModel);
    const out = await wrapped.generate({ messages: [], temperature: 0.5 });
    expect(out.text).toBe('hi');
    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0];
    expect(span?.name).toBe('gen_ai.openai.chat');
    expect(span?.attributes[ATTR.GenAiSystem]).toBe('openai');
    expect(span?.attributes[ATTR.GenAiRequestModel]).toBe('m1');
    expect(span?.attributes[ATTR.GenAiRequestTemperature]).toBe(0.5);
    expect(span?.attributes[ATTR.GenAiUsageTotalTokens]).toBe(10);
    expect(span?.ended).toBe(true);
    expect(span?.status?.code).toBe(1);
  });

  it('attaches finish attributes when stream completes', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const wrapped = instrumentModel(fakeModel);
    const stream = await wrapped.stream({ messages: [] });
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
    const span = tracer.spans[0];
    expect(span?.name).toBe('gen_ai.openai.chat.stream');
    expect(span?.attributes[ATTR.GenAiUsageTotalTokens]).toBe(3);
    expect(span?.ended).toBe(true);
  });

  it('records errors thrown by generate()', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const failing: LanguageModel = {
      ...fakeModel,
      async generate() {
        throw new Error('boom');
      },
    };
    await expect(instrumentModel(failing).generate({ messages: [] })).rejects.toThrow('boom');
    const span = tracer.spans[0];
    expect(span?.exceptions).toHaveLength(1);
    expect(span?.status?.code).toBe(2);
  });
});
