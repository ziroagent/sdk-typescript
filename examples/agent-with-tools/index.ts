import { createAgent } from '@ziro-ai/agent';
import { createOpenAI } from '@ziro-ai/openai';
import { defineTool } from '@ziro-ai/tools';
import { z } from 'zod';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running this example.');
  process.exit(1);
}

const openai = createOpenAI({ apiKey });

const getWeather = defineTool({
  name: 'getWeather',
  description: 'Get the current weather for a given city.',
  input: z.object({ city: z.string().describe('City name, e.g. "Hanoi"') }),
  execute: async ({ city }) => {
    const tempC = 18 + Math.floor(Math.random() * 12);
    return { city, tempC, conditions: 'sunny' };
  },
});

const calculate = defineTool({
  name: 'calculate',
  description: 'Evaluate a basic arithmetic expression with +, -, *, / and parens.',
  input: z.object({ expression: z.string() }),
  execute: ({ expression }) => {
    if (!/^[\d+\-*/().\s]+$/.test(expression)) {
      throw new Error(`Refusing to evaluate unsafe expression: ${expression}`);
    }
    return Function(`"use strict"; return (${expression});`)();
  },
});

const agent = createAgent({
  model: openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini'),
  tools: { getWeather, calculate },
  maxSteps: 6,
});

const result = await agent.run({
  prompt:
    'What is the weather in Hanoi right now? Convert the temperature to Fahrenheit ' +
    'using the calculate tool, then summarize.',
  onEvent: (event) => {
    if (event.type === 'tool-result') {
      console.log(`[tool] ${event.result.toolName} →`, event.result.result);
    }
  },
});

console.log('\n--- final answer ---');
console.log(result.text);
console.log('\nfinishReason:', result.finishReason);
console.log('totalUsage:', result.totalUsage);
