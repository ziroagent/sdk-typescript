# @ziro-agent/ollama

Ollama provider for ZiroAgent SDK — run open-weight LLMs locally with
the same interface as `@ziro-agent/openai` / `@ziro-agent/anthropic`.

> **Sovereign pillar primitive.** Part of the v0.1.9 *trust recovery*
> milestone (RFC 0004). Lets the SDK keep its OSS-first promise: you
> can build an agent end-to-end without ever sending bytes to a
> third-party API.

## Install

```bash
npm install @ziro-agent/ollama @ziro-agent/agent
```

## Usage

```ts
import { createAgent, generateText } from '@ziro-agent/agent';
import { ollama } from '@ziro-agent/ollama';

const text = await generateText({
  model: ollama('llama3.1'),
  prompt: 'Explain RAG to a junior engineer.',
});

const agent = createAgent({ model: ollama('qwen2.5'), tools: { /* ... */ } });
```

For a remote / containerised daemon:

```ts
import { createOllama } from '@ziro-agent/ollama';

const ollama = createOllama({
  baseURL: process.env.OLLAMA_BASE_URL ?? 'http://ollama:11434',
  defaultOptions: { num_ctx: 8192, repeat_penalty: 1.1 },
});
```

## Budget Guard

Local models are free at runtime, so `Budget Guard` reports `$0` and
`pricingAvailable: true`. `maxUsd` constraints simply never trip
(instead of being silently disabled). The meaningful local-runtime
limits keep working exactly as documented:

- `maxTokens`
- `maxLlmCalls`
- `maxDurationMs`
- `maxSteps`

## Tools

Uses Ollama's native function-calling protocol (not the OpenAI compat
shim — it loses tool-call fidelity on several models). Recommended
tool-capable models: `llama3.1`, `qwen2.5`, `mistral-nemo`, `gemma3`.

## License

Apache-2.0 © ZiroAgent
