import { generateText, streamText } from '@ziro-ai/core';
import { createOpenAI } from '@ziro-ai/openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running this example.');
  process.exit(1);
}

const openai = createOpenAI({ apiKey });
const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

console.log('--- generateText ---');
const single = await generateText({
  model,
  prompt: 'Say hello in one short sentence.',
});
console.log(single.text);
console.log('usage:', single.usage);

console.log('\n--- streamText ---');
const stream = await streamText({
  model,
  prompt: 'Stream the alphabet, comma-separated.',
});

const reader = stream.textStream.getReader();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  process.stdout.write(value);
}
process.stdout.write('\n');
