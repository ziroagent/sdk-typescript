import { generateText } from '@ziro-agent/core';
import { createGroq } from '@ziro-agent/groq';

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error('Set GROQ_API_KEY before running this example.');
  process.exit(1);
}

const groq = createGroq({ apiKey });
/** Model ids change — pick one from https://console.groq.com/docs/models */
const model = groq(process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile');

const out = await generateText({
  model,
  prompt: 'Reply with exactly one word: pong.',
});
console.log(out.text);
