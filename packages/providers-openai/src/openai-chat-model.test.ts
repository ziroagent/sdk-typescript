import { generateText, streamText } from '@ziro-agent/core';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createOpenAI } from './openai-provider.js';

const BASE = 'https://api.openai.com/v1';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('OpenAI chat model — generate (msw)', () => {
  it('returns text and usage from a chat completion', async () => {
    server.use(
      http.post(`${BASE}/chat/completions`, async ({ request }) => {
        const body = (await request.json()) as { model: string; messages: unknown[] };
        expect(body.model).toBe('gpt-4o-mini');
        expect(body.messages).toHaveLength(1);
        return HttpResponse.json({
          id: 'chatcmpl-1',
          choices: [
            {
              message: { role: 'assistant', content: 'hi there' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        });
      }),
    );

    const openai = createOpenAI({ apiKey: 'test' });
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: 'say hi',
    });

    expect(result.text).toBe('hi there');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.totalTokens).toBe(8);
  });

  it('parses tool calls from a chat completion', async () => {
    server.use(
      http.post(`${BASE}/chat/completions`, () =>
        HttpResponse.json({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'getWeather', arguments: '{"city":"Hanoi"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      ),
    );

    const openai = createOpenAI({ apiKey: 'test' });
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: 'weather please',
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
    expect(result.finishReason).toBe('tool-calls');
  });

  it('throws APICallError on non-2xx', async () => {
    server.use(
      http.post(`${BASE}/chat/completions`, () =>
        HttpResponse.json({ error: { message: 'bad key' } }, { status: 401 }),
      ),
    );

    const openai = createOpenAI({ apiKey: 'wrong' });
    await expect(generateText({ model: openai('gpt-4o-mini'), prompt: 'x' })).rejects.toMatchObject(
      { name: 'APICallError', statusCode: 401 },
    );
  });
});

describe('OpenAI chat model — stream (custom fetch)', () => {
  it('parses SSE deltas into text-delta events', async () => {
    const events = [
      '{"choices":[{"delta":{"content":"Hel"}}]}',
      '{"choices":[{"delta":{"content":"lo"}}]}',
      '{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":7}}',
      '[DONE]',
    ];
    const fakeFetch = async () =>
      new Response(sseBody(events), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

    const openai = createOpenAI({ apiKey: 'test', fetch: fakeFetch as typeof fetch });
    const stream = await streamText({ model: openai('gpt-4o-mini'), prompt: 'hi' });

    const chunks: string[] = [];
    for await (const c of stream.toTextIterable()) chunks.push(c);

    expect(chunks.join('')).toBe('Hello');
    await expect(stream.finishReason()).resolves.toBe('stop');
    await expect(stream.usage()).resolves.toEqual({ totalTokens: 7 });
  });
});

describe('OpenAI chat model — estimateCost', () => {
  it('returns sensible bounds for a known model id', async () => {
    const openai = createOpenAI({ apiKey: 'test' });
    const model = openai('gpt-4o-mini');
    if (!model.estimateCost) throw new Error('estimateCost should be defined');
    const r = await model.estimateCost({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello world' }] }],
      maxTokens: 100,
    });
    expect(r.pricingAvailable).toBe(true);
    expect(r.minUsd).toBeGreaterThan(0);
    expect(r.maxUsd).toBeGreaterThan(r.minUsd);
    expect(r.minTokens).toBeGreaterThan(0);
    expect(r.maxTokens).toBeGreaterThan(r.minTokens);
  });

  it('returns pricingAvailable=false for an unknown model id', async () => {
    const openai = createOpenAI({ apiKey: 'test' });
    const model = openai('mystery-model-not-in-table');
    if (!model.estimateCost) throw new Error('estimateCost should be defined');
    const r = await model.estimateCost({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });
    expect(r.pricingAvailable).toBe(false);
    expect(r.minUsd).toBe(0);
    expect(r.maxUsd).toBe(0);
    expect(r.maxTokens).toBeGreaterThan(0);
  });
});

function sseBody(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${e}\n\n`));
      c.close();
    },
  });
}
