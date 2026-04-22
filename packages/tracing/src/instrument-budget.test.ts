import { withBudget } from '@ziro-agent/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ATTR } from './attributes.js';
import { instrumentBudget } from './instrument-budget.js';
import { type SpanLike, setTracer, type ZiroTracer } from './tracer.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  events: { name: string; attributes?: Record<string, unknown> }[];
  status?: { code: number; message?: string };
  exceptions: unknown[];
  ended: boolean;
}

function recordingTracer(): ZiroTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const make = (name: string, initialAttrs?: Record<string, unknown>): SpanLike => {
    const rec: RecordedSpan = {
      name,
      attributes: { ...(initialAttrs ?? {}) },
      events: [],
      exceptions: [],
      ended: false,
    };
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
      addEvent(name, attributes) {
        rec.events.push({ name, ...(attributes ? { attributes } : {}) });
      },
      end() {
        rec.ended = true;
      },
    };
  };
  return {
    spans,
    startSpan(name, options) {
      return make(name, options?.attributes);
    },
    async withSpan(name, fn, options) {
      const span = make(name, options?.attributes);
      try {
        const out = await fn(span);
        span.setStatus({ code: 1 });
        return out;
      } finally {
        span.end();
      }
    },
  };
}

let unregister: () => void = () => {};

beforeEach(() => {
  // Each test gets its own tracer + observer pair; restore in afterEach.
  unregister = () => {};
});

afterEach(() => {
  unregister();
  setTracer(null);
});

describe('instrumentBudget', () => {
  it('opens a scope span on withBudget enter and ends it on exit', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentBudget());

    await withBudget({ maxUsd: 1, maxLlmCalls: 5 }, async () => 'ok');

    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0];
    expect(span?.name).toBe('ziro.budget.scope');
    expect(span?.attributes[ATTR.BudgetSpecMaxUsd]).toBe(1);
    expect(span?.attributes[ATTR.BudgetSpecMaxLlmCalls]).toBe(5);
    expect(span?.attributes[ATTR.BudgetUsedSteps]).toBe(0);
    expect(span?.attributes[ATTR.BudgetRemainingUsd]).toBe(1);
    expect(span?.attributes[ATTR.BudgetRemainingLlmCalls]).toBe(5);
    expect(span?.attributes[ATTR.BudgetScopeOutcome]).toBe('ok');
    expect(span?.ended).toBe(true);
    expect(span?.status?.code).toBe(1);
  });

  it('records remaining.steps when maxSteps is set', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentBudget());

    await withBudget({ maxSteps: 4 }, async () => 'ok');

    const span = tracer.spans[0];
    expect(span?.attributes[ATTR.BudgetSpecMaxSteps]).toBe(4);
    expect(span?.attributes[ATTR.BudgetUsedSteps]).toBe(0);
    expect(span?.attributes[ATTR.BudgetRemainingSteps]).toBe(4);
  });

  it('marks the scope span as error when fn throws', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentBudget());

    await expect(
      withBudget({ maxUsd: 1 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const span = tracer.spans[0];
    expect(span?.attributes[ATTR.BudgetScopeOutcome]).toBe('error');
    expect(span?.status?.code).toBe(2);
    expect(span?.ended).toBe(true);
  });

  it('records ziro.budget.exceeded event + exception when limit hit', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentBudget());

    const { generateText } = await import('@ziro-agent/core');
    const model = {
      modelId: 'mock',
      provider: 'mock',
      async generate() {
        return {
          text: 'x',
          content: [{ type: 'text' as const, text: 'x' }],
          finishReason: 'stop' as const,
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          toolCalls: [],
        };
      },
      async stream() {
        throw new Error('not used');
      },
    };

    await expect(
      generateText({ model, prompt: 'x', budget: { maxLlmCalls: 0 } }),
    ).rejects.toThrow();

    const span = tracer.spans[0];
    const exceededEvent = span?.events.find((e) => e.name === 'ziro.budget.exceeded');
    expect(exceededEvent).toBeDefined();
    expect(exceededEvent?.attributes?.[ATTR.BudgetExceededKind]).toBe('llmCalls');
    expect(exceededEvent?.attributes?.[ATTR.BudgetExceededLimit]).toBe(0);
    expect(span?.exceptions).toHaveLength(1);
    expect(span?.attributes[ATTR.BudgetScopeOutcome]).toBe('error');
  });

  it('emits ziro.budget.warning when warnAt threshold crossed', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentBudget());

    const { generateText } = await import('@ziro-agent/core');
    const model = {
      modelId: 'mock',
      provider: 'mock',
      async generate() {
        return {
          text: 'x',
          content: [{ type: 'text' as const, text: 'x' }],
          finishReason: 'stop' as const,
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          toolCalls: [],
        };
      },
      async stream() {
        throw new Error('not used');
      },
    };

    await generateText({
      model,
      prompt: 'x',
      budget: { maxTokens: 1000, warnAt: { tokens: 100 } },
    });

    const span = tracer.spans[0];
    const warning = span?.events.find((e) => e.name === 'ziro.budget.warning');
    expect(warning).toBeDefined();
    expect(warning?.attributes?.[ATTR.BudgetWarningKind]).toBe('tokens');
    expect(warning?.attributes?.[ATTR.BudgetWarningThreshold]).toBe(100);
  });

  it('unregister restores the previous observer', async () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const { unregister: u } = instrumentBudget();
    u();
    // After unregister, no spans should be created by withBudget.
    await withBudget({ maxUsd: 1 }, async () => 'ok');
    expect(tracer.spans).toHaveLength(0);
  });
});
