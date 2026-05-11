import { generateText } from '@ziro-agent/core';
import { createOllama } from '@ziro-agent/ollama';

/**
 * Minimal **air-gapped** path: local Ollama only (no cloud API keys).
 * Requires `ollama serve` and a pulled model, e.g. `ollama pull llama3.2`.
 */
const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const modelId = process.env.OLLAMA_MODEL ?? 'llama3.2';

const provider = createOllama({ baseURL });
const model = provider(modelId);

const out = await generateText({
  model,
  prompt: 'Reply with exactly one word: OK.',
});
console.log(out.text);
