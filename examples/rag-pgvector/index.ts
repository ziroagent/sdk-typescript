import { generateText } from '@ziro-ai/core';
import { chunkText, createOpenAIEmbedder } from '@ziro-ai/memory';
import { PgVectorStore } from '@ziro-ai/memory/pgvector';
import { createOpenAI } from '@ziro-ai/openai';
import pg from 'pg';

const apiKey = process.env.OPENAI_API_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!apiKey || !dbUrl) {
  console.error('Set OPENAI_API_KEY and DATABASE_URL before running this example.');
  process.exit(1);
}

const openai = createOpenAI({ apiKey });
const embedder = createOpenAIEmbedder({ apiKey, model: 'text-embedding-3-small' });

const pool = new pg.Pool({ connectionString: dbUrl });
const store = new PgVectorStore({ pool, dimensions: embedder.dimensions, embedder });
await store.init();

const KNOWLEDGE = [
  'Ziro AI SDK is an open-source TypeScript SDK for building LLM-powered apps.',
  'Streams in Ziro are Web Streams (ReadableStream<T>); they back generateText and streamText.',
  'Tools in Ziro are defined with Zod and validated before being passed to a model.',
  'The agent loop terminates when the model returns no tool calls, stopWhen fires, or maxSteps is hit.',
  'PgVectorStore supports cosine, inner-product, and L2 distance — cosine by default.',
];

console.log('Indexing knowledge base...');
await store.add(
  KNOWLEDGE.flatMap((text, i) =>
    chunkText(text, { chunkSize: 200, chunkOverlap: 0 }).map((c, j) => ({
      id: `kb:${i}:${j}`,
      text: c,
      metadata: { source: `kb:${i}` },
    })),
  ),
);
console.log(`Stored ${await store.count()} chunks.`);

const question = process.argv.slice(2).join(' ') || 'How do tools work in Ziro?';
console.log(`\nQuestion: ${question}`);

const hits = await store.search({ text: question, topK: 3 });
const context = hits.map((h, i) => `[${i + 1}] ${h.text}`).join('\n');

const { text } = await generateText({
  model: openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini'),
  system: 'You are a helpful assistant. Answer using ONLY the provided context.',
  prompt: `Context:\n${context}\n\nQuestion: ${question}`,
});

console.log('\nAnswer:', text);

await pool.end();
