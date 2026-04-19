import { generateText } from '@ziro-agent/core';
import { createOpenAI } from '@ziro-agent/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const result = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Say hello in one short sentence.',
});

console.log(result.text);
