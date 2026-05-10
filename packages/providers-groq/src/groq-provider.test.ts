import { generateText } from '@ziro-agent/core';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGroq } from './index.js';

const BASE = 'https://api.groq.com/openai/v1';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Groq provider', () => {
  it('calls Groq chat completions endpoint', async () => {
    server.use(
      http.post(`${BASE}/chat/completions`, async ({ request }) => {
        expect(request.url).toContain('api.groq.com');
        const body = (await request.json()) as { model: string };
        expect(body.model).toBe('llama-3.3-70b-versatile');
        return HttpResponse.json({
          id: 'chatcmpl-groq',
          choices: [
            {
              message: { role: 'assistant', content: 'from groq' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
        });
      }),
    );

    const g = createGroq({ apiKey: 'gsk_test' });
    const result = await generateText({
      model: g('llama-3.3-70b-versatile'),
      prompt: 'ping',
    });

    expect(result.text).toBe('from groq');
  });
});
