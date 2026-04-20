# @ziro-agent/google

Google Gemini provider for the ZiroAgent SDK. Targets the
[Generative Language API](https://ai.google.dev/api) over an API key,
or Vertex AI via custom OAuth headers.

```bash
pnpm add @ziro-agent/google
```

## Quick start

```ts
import { generateText } from '@ziro-agent/core';
import { google } from '@ziro-agent/google';

const result = await generateText({
  model: google('gemini-2.5-flash'),
  prompt: 'Explain quantum entanglement in two sentences.',
});

console.log(result.text);
```

API key resolution order:

1. `createGoogle({ apiKey })`
2. `process.env.GOOGLE_GENERATIVE_AI_API_KEY`
3. `process.env.GEMINI_API_KEY`

## Streaming

```ts
import { streamText } from '@ziro-agent/core';
import { google } from '@ziro-agent/google';

const stream = await streamText({
  model: google('gemini-2.5-flash'),
  prompt: 'Stream a haiku about TypeScript',
});

for await (const delta of stream.toTextIterable()) process.stdout.write(delta);
```

The adapter targets `:streamGenerateContent?alt=sse`. Each SSE chunk is
a JSON-encoded `GenerateContentResponse` and its parts are surfaced as
either `text-delta` or `tool-call` events.

## Tool calling

```ts
const result = await generateText({
  model: google('gemini-2.5-flash'),
  prompt: 'What time is it in Hanoi?',
  tools: [
    {
      name: 'getTime',
      description: 'Returns the current time in a city',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  ],
});
```

Note that Gemini's API does **not** return ids for function calls. The
adapter synthesizes a stable `gemini_<name>_<index>` id so downstream
tool-result correlation still works. Treat them as opaque.

## Vertex AI / OAuth

Pass an `Authorization` header — the adapter detects this and skips the
`?key=...` query parameter:

```ts
import { createGoogle } from '@ziro-agent/google';

const vertex = createGoogle({
  baseURL: 'https://us-central1-aiplatform.googleapis.com/v1/projects/<proj>/locations/us-central1/publishers/google',
  headers: { Authorization: `Bearer ${oauthToken}` },
});
```

## Model ids

Verified against `https://ai.google.dev/pricing` on `2026-04-22`:

| Id                          | Tier    | Status     |
| --------------------------- | ------- | ---------- |
| `gemini-2.0-flash`          | Mid     | verified   |
| `gemini-2.0-flash-lite`     | Small   | verified   |
| `gemini-2.5-pro`            | Flagship| unverified |
| `gemini-2.5-flash`          | Mid     | unverified |
| `gemini-2.5-flash-lite`     | Small   | unverified |

The 2.5-series rows are marked `unverified: true` per RFC 0004's
trust-recovery convention — Budget Guard's pre-flight USD bound returns
`pricingAvailable: false` until they can be cross-referenced against
the live pricing page. This avoids silently shipping a speculative rate.
