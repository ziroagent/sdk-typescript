import { describe, expect, it, vi } from 'vitest';
import type { LanguageModelMiddleware } from '../types/middleware.js';
import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from '../types/model.js';
import { wrapModel } from './wrap-model.js';

const makeModel = (overrides: Partial<LanguageModel> = {}): LanguageModel => ({
  modelId: 'mock',
  provider: 'mock',
  generate: vi.fn(
    async (_o: ModelCallOptions): Promise<ModelGenerateResult> => ({
      text: 'inner',
      content: [{ type: 'text', text: 'inner' }],
      toolCalls: [],
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }),
  ),
  stream: vi.fn(async (): Promise<ReadableStream<ModelStreamPart>> => {
    return new ReadableStream<ModelStreamPart>({
      start(controller) {
        controller.enqueue({ type: 'text-delta', textDelta: 'inner' });
        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        });
        controller.close();
      },
    });
  }),
  ...overrides,
});

const baseCall = (): ModelCallOptions => ({ messages: [{ role: 'user', content: 'hi' }] });

describe('wrapModel', () => {
  it('passes through unchanged when middleware list is empty', async () => {
    const model = makeModel();
    const wrapped = wrapModel(model, []);
    const result = await wrapped.generate(baseCall());
    expect(result.text).toBe('inner');
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('runs transformParams in array order, feeding each into the next', async () => {
    const calls: ModelCallOptions[] = [];
    const model = makeModel({
      generate: vi.fn(async (o: ModelCallOptions) => {
        calls.push(o);
        return {
          text: 'ok',
          content: [{ type: 'text', text: 'ok' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      }),
    });
    const tagA: LanguageModelMiddleware = {
      transformParams: ({ params }) => ({
        ...params,
        messages: [...params.messages, { role: 'user', content: 'A' }],
      }),
    };
    const tagB: LanguageModelMiddleware = {
      transformParams: ({ params }) => ({
        ...params,
        messages: [...params.messages, { role: 'user', content: 'B' }],
      }),
    };
    const wrapped = wrapModel(model, [tagA, tagB]);
    await wrapped.generate(baseCall());
    expect(calls[0]?.messages.map((m) => m.content)).toEqual(['hi', 'A', 'B']);
  });

  it('wrapGenerate runs in onion order: outer sees response last', async () => {
    const trace: string[] = [];
    const outer: LanguageModelMiddleware = {
      async wrapGenerate({ doGenerate }) {
        trace.push('outer:before');
        const r = await doGenerate();
        trace.push('outer:after');
        return { ...r, text: `[outer]${r.text}` };
      },
    };
    const inner: LanguageModelMiddleware = {
      async wrapGenerate({ doGenerate }) {
        trace.push('inner:before');
        const r = await doGenerate();
        trace.push('inner:after');
        return { ...r, text: `[inner]${r.text}` };
      },
    };
    const wrapped = wrapModel(makeModel(), [outer, inner]);
    const result = await wrapped.generate(baseCall());
    expect(trace).toEqual(['outer:before', 'inner:before', 'inner:after', 'outer:after']);
    expect(result.text).toBe('[outer][inner]inner');
  });

  it('wrapGenerate can short-circuit (cache hit) without calling doGenerate', async () => {
    const model = makeModel();
    const cache: LanguageModelMiddleware = {
      async wrapGenerate(): Promise<ModelGenerateResult> {
        return {
          text: 'cached',
          content: [{ type: 'text', text: 'cached' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
    };
    const wrapped = wrapModel(model, cache);
    const result = await wrapped.generate(baseCall());
    expect(result.text).toBe('cached');
    expect(model.generate).not.toHaveBeenCalled();
  });

  it('wrapStream composes via TransformStream and preserves chunk order', async () => {
    const upper: LanguageModelMiddleware = {
      async wrapStream({ doStream }) {
        const src = await doStream();
        const t = new TransformStream<ModelStreamPart, ModelStreamPart>({
          transform(chunk, controller) {
            if (chunk.type === 'text-delta') {
              controller.enqueue({ type: 'text-delta', textDelta: chunk.textDelta.toUpperCase() });
            } else {
              controller.enqueue(chunk);
            }
          },
        });
        return src.pipeThrough(t);
      },
    };
    const wrapped = wrapModel(makeModel(), upper);
    const stream = await wrapped.stream(baseCall());
    const chunks: ModelStreamPart[] = [];
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks[0]).toEqual({ type: 'text-delta', textDelta: 'INNER' });
    expect(chunks[1]?.type).toBe('finish');
  });

  it('preserves modelId / provider / estimateCost from the underlying model', () => {
    const estimate = vi.fn();
    const model = makeModel({
      modelId: 'gpt-4o-mini',
      provider: 'openai',
      estimateCost: estimate,
    });
    const wrapped = wrapModel(model, []);
    expect(wrapped.modelId).toBe('gpt-4o-mini');
    expect(wrapped.provider).toBe('openai');
    expect(typeof wrapped.estimateCost).toBe('function');
  });

  it('skips middlewares that omit a hook', async () => {
    const transformOnly: LanguageModelMiddleware = {
      transformParams: ({ params }) => params,
    };
    const wrapOnly: LanguageModelMiddleware = {
      async wrapGenerate({ doGenerate }) {
        const r = await doGenerate();
        return { ...r, text: `wrapped:${r.text}` };
      },
    };
    const wrapped = wrapModel(makeModel(), [transformOnly, wrapOnly]);
    const result = await wrapped.generate(baseCall());
    expect(result.text).toBe('wrapped:inner');
  });
});
