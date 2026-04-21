import { generateText, streamText } from '@ziro-agent/core';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGoogle } from './google-provider.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Google Gemini model — generate', () => {
  it('returns text + usage and hoists system into systemInstruction', async () => {
    server.use(
      http.post(`${BASE}/models/gemini-2.0-flash:generateContent`, async ({ request }) => {
        const body = (await request.json()) as {
          contents: unknown[];
          systemInstruction?: { parts: { text: string }[] };
        };
        // System message must be hoisted out of `contents` and placed
        // at the top level — the whole point of Gemini's wire format.
        expect(body.systemInstruction?.parts?.[0]?.text).toBe('be concise');
        expect(body.contents).toHaveLength(1);
        return HttpResponse.json({
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'hi there' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 3, totalTokenCount: 7 },
        });
      }),
    );

    const google = createGoogle({ apiKey: 'test' });
    const result = await generateText({
      model: google('gemini-2.0-flash'),
      system: 'be concise',
      prompt: 'say hi',
    });
    expect(result.text).toBe('hi there');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toMatchObject({ promptTokens: 4, completionTokens: 3, totalTokens: 7 });
  });

  it('maps video user parts to Gemini fileData (https URL)', async () => {
    server.use(
      http.post(`${BASE}/models/gemini-2.0-flash:generateContent`, async ({ request }) => {
        const body = (await request.json()) as {
          contents?: Array<{ parts?: unknown[] }>;
        };
        const parts = body.contents?.[0]?.parts;
        expect(parts).toEqual(
          expect.arrayContaining([
            {
              fileData: {
                mimeType: 'video/mp4',
                fileUri: 'https://cdn.example.com/clip.mp4',
              },
            },
          ]),
        );
        return HttpResponse.json({
          candidates: [
            { content: { role: 'model', parts: [{ text: 'clip summary' }] }, finishReason: 'STOP' },
          ],
          usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2, totalTokenCount: 4 },
        });
      }),
    );

    const google = createGoogle({ apiKey: 'test' });
    const result = await generateText({
      model: google('gemini-2.0-flash'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What happens in this video?' },
            { type: 'video', video: 'https://cdn.example.com/clip.mp4', mimeType: 'video/mp4' },
          ],
        },
      ],
    });
    expect(result.text).toBe('clip summary');
  });

  it('parses functionCall parts as tool calls and synthesizes ids', async () => {
    server.use(
      http.post(`${BASE}/models/gemini-2.5-flash:generateContent`, () =>
        HttpResponse.json({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: { name: 'getWeather', args: { city: 'Hanoi' } },
                  },
                ],
              },
              finishReason: 'TOOL_CALL',
            },
          ],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      ),
    );

    const google = createGoogle({ apiKey: 'test' });
    const result = await generateText({
      model: google('gemini-2.5-flash'),
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
    // Gemini doesn't return tool ids — we must synthesize a stable one.
    expect(result.toolCalls[0]?.toolCallId).toBe('gemini_getWeather_0');
    expect(result.finishReason).toBe('tool-calls');
  });

  it('appends ?key=<apiKey> when no Authorization header is provided', async () => {
    server.use(
      http.post(`${BASE}/models/gemini-2.0-flash:generateContent`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('key')).toBe('test-key');
        return HttpResponse.json({
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        });
      }),
    );
    const google = createGoogle({ apiKey: 'test-key' });
    const result = await generateText({ model: google('gemini-2.0-flash'), prompt: 'x' });
    expect(result.text).toBe('ok');
  });

  it('omits ?key=... when an Authorization header is supplied (Vertex / OAuth path)', async () => {
    server.use(
      http.post(`${BASE}/models/gemini-2.0-flash:generateContent`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('key')).toBeNull();
        expect(request.headers.get('authorization')).toBe('Bearer oauth-token');
        return HttpResponse.json({
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        });
      }),
    );
    const google = createGoogle({
      apiKey: 'test-key', // ignored when an Authorization header is set
      headers: { Authorization: 'Bearer oauth-token' },
    });
    const result = await generateText({ model: google('gemini-2.0-flash'), prompt: 'x' });
    expect(result.text).toBe('ok');
  });
});

describe('Google Gemini model — stream', () => {
  it('parses :streamGenerateContent SSE into text deltas + finish', async () => {
    const chunks: string[] = [
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Hel' }] } }],
      }),
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'lo' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
      }),
    ];

    const fakeFetch = async () =>
      new Response(sseBody(chunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

    const google = createGoogle({ apiKey: 'test', fetch: fakeFetch as typeof fetch });
    const stream = await streamText({ model: google('gemini-2.0-flash'), prompt: 'hi' });

    const out: string[] = [];
    for await (const c of stream.toTextIterable()) out.push(c);
    expect(out.join('')).toBe('Hello');
    await expect(stream.finishReason()).resolves.toBe('stop');
    const usage = await stream.usage();
    // Gemini emits cumulative usage, so we keep latest values rather than summing.
    expect(usage.promptTokens).toBe(4);
    expect(usage.completionTokens).toBe(2);
    expect(usage.totalTokens).toBe(6);
  });

  it('emits a single tool-call event when functionCall arrives in stream', async () => {
    const chunks: string[] = [
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: 'lookup', args: { id: 1 } } }],
            },
            finishReason: 'TOOL_CALL',
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      }),
    ];
    const fakeFetch = async () =>
      new Response(sseBody(chunks), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    const google = createGoogle({ apiKey: 'test', fetch: fakeFetch as typeof fetch });
    const stream = await streamText({
      model: google('gemini-2.0-flash'),
      prompt: 'go',
      tools: [{ name: 'lookup', parameters: { type: 'object', properties: {} } }],
    });

    // Drain.
    for await (const _ of stream.toTextIterable()) {
      // ignore text — there is none in this test
    }
    await expect(stream.finishReason()).resolves.toBe('tool-calls');
  });
});

describe('Google Gemini model — estimateCost', () => {
  it('returns sensible bounds for a verified 2.0-series id', async () => {
    const google = createGoogle({ apiKey: 'test' });
    const model = google('gemini-2.0-flash');
    if (!model.estimateCost) throw new Error('estimateCost should be defined');
    const r = await model.estimateCost({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello world' }] }],
      maxTokens: 200,
    });
    expect(r.pricingAvailable).toBe(true);
    expect(r.minUsd).toBeGreaterThan(0);
    expect(r.maxUsd).toBeGreaterThan(r.minUsd);
    expect(r.maxTokens).toBeGreaterThan(r.minTokens);
  });

  it('returns pricingAvailable=false for unverified 2.5-series ids by default', async () => {
    // gemini-2.5-pro is `unverified: true` in the pricing table since
    // we cannot cross-check the rate. Pre-flight USD enforcement must
    // NOT trust the speculative rate.
    const google = createGoogle({ apiKey: 'test' });
    const model = google('gemini-2.5-pro');
    if (!model.estimateCost) throw new Error('estimateCost should be defined');
    const r = await model.estimateCost({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    });
    expect(r.pricingAvailable).toBe(false);
  });

  it('returns pricingAvailable=false for unknown id', async () => {
    const google = createGoogle({ apiKey: 'test' });
    const model = google('gemini-not-real');
    if (!model.estimateCost) throw new Error('estimateCost should be defined');
    const r = await model.estimateCost({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    });
    expect(r.pricingAvailable).toBe(false);
  });
});

function sseBody(jsonChunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const data of jsonChunks) {
        c.enqueue(enc.encode(`data: ${data}\n\n`));
      }
      c.close();
    },
  });
}
