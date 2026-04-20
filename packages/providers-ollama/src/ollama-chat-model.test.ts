import { generateText, streamText } from '@ziro-agent/core';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createOllama } from './ollama-provider.js';

const BASE = 'http://localhost:11434';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Ollama chat model — generate (msw)', () => {
  it('returns text + usage and forwards model + sampling options', async () => {
    server.use(
      http.post(`${BASE}/api/chat`, async ({ request }) => {
        const body = (await request.json()) as {
          model: string;
          stream: boolean;
          options?: Record<string, unknown>;
        };
        expect(body.model).toBe('llama3.1');
        expect(body.stream).toBe(false);
        expect(body.options?.temperature).toBe(0.2);
        expect(body.options?.num_predict).toBe(64);
        return HttpResponse.json({
          model: 'llama3.1',
          created_at: '2026-04-22T00:00:00Z',
          message: { role: 'assistant', content: 'hi from ollama' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 7,
          eval_count: 3,
        });
      }),
    );

    const ollama = createOllama();
    const result = await generateText({
      model: ollama('llama3.1'),
      prompt: 'say hi',
      temperature: 0.2,
      maxTokens: 64,
    });

    expect(result.text).toBe('hi from ollama');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.promptTokens).toBe(7);
    expect(result.usage.completionTokens).toBe(3);
    expect(result.usage.totalTokens).toBe(10);
  });

  it('parses native Ollama tool calls and synthesises stable ids', async () => {
    server.use(
      http.post(`${BASE}/api/chat`, async ({ request }) => {
        const body = (await request.json()) as {
          tools?: Array<{ function?: { name?: string } }>;
        };
        expect(body.tools?.[0]?.function?.name).toBe('getWeather');
        return HttpResponse.json({
          model: 'qwen2.5',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'getWeather',
                  arguments: { city: 'Hanoi' },
                },
              },
            ],
          },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 5,
          eval_count: 8,
        });
      }),
    );

    const ollama = createOllama();
    const result = await generateText({
      model: ollama('qwen2.5'),
      prompt: 'weather',
      tools: [
        {
          name: 'getWeather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.toolName).toBe('getWeather');
    expect(result.toolCalls[0]?.args).toEqual({ city: 'Hanoi' });
    expect(result.toolCalls[0]?.toolCallId).toMatch(/^ollama_getWeather_0_/);
    expect(result.finishReason).toBe('tool-calls');
  });

  it('throws APICallError when the daemon returns 404', async () => {
    server.use(
      http.post(`${BASE}/api/chat`, () =>
        HttpResponse.json({ error: 'model not found' }, { status: 404 }),
      ),
    );

    const ollama = createOllama();
    await expect(
      generateText({ model: ollama('does-not-exist'), prompt: 'hi' }),
    ).rejects.toMatchObject({ name: 'APICallError', statusCode: 404 });
  });

  it('respects a custom baseURL (containerised Ollama)', async () => {
    const REMOTE = 'http://ollama:11434';
    server.use(
      http.post(`${REMOTE}/api/chat`, () =>
        HttpResponse.json({
          message: { role: 'assistant', content: 'remote' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 1,
          eval_count: 1,
        }),
      ),
    );
    const ollama = createOllama({ baseURL: 'http://ollama:11434/' });
    const result = await generateText({ model: ollama('llama3.1'), prompt: 'x' });
    expect(result.text).toBe('remote');
  });
});

describe('Ollama chat model — stream (NDJSON)', () => {
  it('parses NDJSON deltas and emits a finish event with usage', async () => {
    const lines = [
      JSON.stringify({ message: { content: 'Hello' }, done: false }),
      JSON.stringify({ message: { content: ', ' }, done: false }),
      JSON.stringify({ message: { content: 'world' }, done: false }),
      JSON.stringify({
        message: { content: '' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 4,
        eval_count: 3,
      }),
    ].join('\n');

    server.use(http.post(`${BASE}/api/chat`, () => new HttpResponse(lines, { status: 200 })));

    const ollama = createOllama();
    const result = await streamText({ model: ollama('llama3.1'), prompt: 'say hi' });
    let text = '';
    for await (const part of result.textStream) text += part;
    const final = await result.finishReason();
    const usage = await result.usage();
    expect(text).toBe('Hello, world');
    expect(final).toBe('stop');
    expect(usage.totalTokens).toBe(7);
  });
});

describe('Ollama chat model — pricing', () => {
  it('reports zero USD with pricingAvailable=true so maxUsd budgets compose cleanly', async () => {
    const ollama = createOllama();
    const model = ollama('llama3.1');
    const cost = model.estimateCost?.({ messages: [{ role: 'user', content: 'hi' }] });
    expect(cost?.pricingAvailable).toBe(true);
    expect(cost?.minUsd).toBe(0);
    expect(cost?.maxUsd).toBe(0);
  });
});
