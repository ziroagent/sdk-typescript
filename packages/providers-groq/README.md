# @ziro-agent/groq

[GroqCloud](https://console.groq.com/) chat completions via the **OpenAI-compatible** HTTP API.

Implementation reuses [`@ziro-agent/openai`](../providers-openai) with:

- Base URL: `https://api.groq.com/openai/v1`
- Default API key: `process.env.GROQ_API_KEY`

## Usage

```ts
import { generateText } from '@ziro-agent/core';
import { groq } from '@ziro-agent/groq';

const result = await generateText({
  model: groq('llama-3.3-70b-versatile'),
  prompt: 'Say hello in one sentence.',
});
```

Model ids change over time — see [Groq docs](https://console.groq.com/docs/models).

## Custom client

```ts
import { createGroq } from '@ziro-agent/groq';

const g = createGroq({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});
```
