import { generateText, streamText } from '@ziro-agent/core';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider.js';

const BASE = 'https://api.anthropic.com/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Anthropic messages model — generate', () => {
  it('returns text and usage', async () => {
    server.use(
      http.post(`${BASE}/messages`, async ({ request }) => {
        const body = (await request.json()) as { model: string; system?: string };
        expect(body.model).toBe('claude-sonnet-4-5');
        expect(body.system).toBe('be concise');
        return HttpResponse.json({
          id: 'msg_1',
          content: [{ type: 'text', text: 'hi there' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 4, output_tokens: 3 },
        });
      }),
    );

    const anthropic = createAnthropic({ apiKey: 'test' });
    const result = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      system: 'be concise',
      prompt: 'say hi',
    });
    expect(result.text).toBe('hi there');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toMatchObject({
      promptTokens: 4,
      completionTokens: 3,
      totalTokens: 7,
    });
  });

  it('parses tool_use blocks', async () => {
    server.use(
      http.post(`${BASE}/messages`, () =>
        HttpResponse.json({
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'getWeather', input: { city: 'Hanoi' } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      ),
    );

    const anthropic = createAnthropic({ apiKey: 'test' });
    const result = await generateText({
      model: anthropic('claude-sonnet-4-5'),
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
});

describe('Anthropic messages model — stream', () => {
  it('parses event stream into text deltas and finish', async () => {
    const events: Array<[string, string]> = [
      ['message_start', JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 4, output_tokens: 0 } } })],
      ['content_block_start', JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })],
      ['content_block_delta', JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } })],
      ['content_block_delta', JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } })],
      ['message_delta', JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } })],
      ['message_stop', JSON.stringify({ type: 'message_stop' })],
    ];

    const fakeFetch = async () =>
      new Response(sseBody(events), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

    const anthropic = createAnthropic({ apiKey: 'test', fetch: fakeFetch as typeof fetch });
    const stream = await streamText({
      model: anthropic('claude-sonnet-4-5'),
      prompt: 'hi',
    });

    const chunks: string[] = [];
    for await (const c of stream.toTextIterable()) chunks.push(c);
    expect(chunks.join('')).toBe('Hello');
    await expect(stream.finishReason()).resolves.toBe('stop');
    const usage = await stream.usage();
    expect(usage.promptTokens).toBe(4);
    expect(usage.completionTokens).toBe(2);
  });
});

function sseBody(events: Array<[string, string]>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const [name, data] of events) {
        c.enqueue(enc.encode(`event: ${name}\ndata: ${data}\n\n`));
      }
      c.close();
    },
  });
}
