import type { LanguageModel, ModelGenerateResult, ToolCallPart } from '@ziro-agent/core';
import { defineTool } from '@ziro-agent/tools';
import { ATTR, type SpanLike, setTracer, type ZiroTracer } from '@ziro-agent/tracing';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  ended: boolean;
}

function recordingTracer(): ZiroTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const make = (name: string): SpanLike => {
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
      return make(n);
    },
    async withSpan(n, fn) {
      const s = make(n);
      try {
        return await fn(s);
      } finally {
        s.end();
      }
    },
  };
}

function scriptedModel(responses: ModelGenerateResult[]): LanguageModel {
  let i = 0;
  return {
    modelId: 'mock',
    provider: 'mock',
    async generate(): Promise<ModelGenerateResult> {
      const r = responses[i++];
      if (!r) throw new Error('Mock model exhausted');
      return r;
    },
    async stream(): Promise<ReadableStream> {
      throw new Error('not implemented');
    },
  };
}

const text = (t: string): ModelGenerateResult => ({
  text: t,
  content: [{ type: 'text', text: t }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

const toolCall = (toolName: string, args: unknown, toolCallId = 'c1'): ModelGenerateResult => {
  const tc: ToolCallPart = { type: 'tool-call', toolCallId, toolName, args };
  return {
    text: '',
    content: [tc],
    toolCalls: [tc],
    finishReason: 'tool-calls',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };
};

afterEach(() => setTracer(null));

describe('createAgent traceTools', () => {
  it('opens a tool span per execute when traceTools is true', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);

    const ping = defineTool({
      name: 'ping',
      input: z.object({}),
      execute: () => 'pong',
    });

    const agent = createAgent({
      model: scriptedModel([toolCall('ping', {}), text('done')]),
      tools: { ping },
      traceTools: true,
      maxSteps: 4,
    });

    await agent.run({ prompt: 'call ping' });

    const toolSpans = tracer.spans.filter((s) => s.name === 'gen_ai.tool.ping');
    expect(toolSpans.length).toBeGreaterThanOrEqual(1);
    const last = toolSpans[toolSpans.length - 1];
    expect(last?.attributes[ATTR.ToolName]).toBe('ping');
    expect(last?.ended).toBe(true);
  });

  it('does not wrap tools when traceTools is omitted', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);

    const ping = defineTool({
      name: 'ping',
      input: z.object({}),
      execute: () => 'pong',
    });

    const agent = createAgent({
      model: scriptedModel([toolCall('ping', {}), text('done')]),
      tools: { ping },
      maxSteps: 4,
    });

    await agent.run({ prompt: 'call ping' });

    expect(tracer.spans.some((s) => s.name === 'gen_ai.tool.ping')).toBe(false);
  });
});
