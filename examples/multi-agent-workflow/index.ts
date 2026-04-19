import { createAgent } from '@ziroagent/agent';
import { createOpenAI } from '@ziroagent/openai';
import { defineNode, defineWorkflow, runWorkflow } from '@ziroagent/workflow';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running this example.');
  process.exit(1);
}

const openai = createOpenAI({ apiKey });
const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

interface State {
  topic: string;
  outline?: string;
  draft?: string;
  critique?: string;
  final?: string;
}

const planner = createAgent({
  model,
  system:
    'You are a planning agent. Produce a tight 3-bullet outline for the given topic. ' +
    'Reply with ONLY the bullet list.',
});

const writer = createAgent({
  model,
  system:
    'You are a writing agent. Expand the outline into a single short paragraph (≤80 words). ' +
    'Reply with ONLY the paragraph.',
});

const critic = createAgent({
  model,
  system:
    'You are a critic agent. Suggest at most one concrete improvement, in one sentence.',
});

const editor = createAgent({
  model,
  system:
    'You are an editor agent. Apply the critic feedback to produce the final paragraph. ' +
    'Reply with ONLY the final paragraph.',
});

const wf = defineWorkflow<State>({
  initialState: { topic: process.argv.slice(2).join(' ') || 'streaming AI agents in TypeScript' },
  nodes: [
    defineNode<State>({
      id: 'plan',
      edges: ['draft'],
      run: async ({ state }) => {
        const { text } = await planner.run({ prompt: `Topic: ${state.topic}` });
        return { state: { outline: text } };
      },
    }),
    defineNode<State>({
      id: 'draft',
      edges: ['critique'],
      run: async ({ state }) => {
        const { text } = await writer.run({ prompt: `Outline:\n${state.outline}` });
        return { state: { draft: text } };
      },
    }),
    defineNode<State>({
      id: 'critique',
      edges: ['edit'],
      run: async ({ state }) => {
        const { text } = await critic.run({ prompt: `Draft:\n${state.draft}` });
        return { state: { critique: text } };
      },
    }),
    defineNode<State>({
      id: 'edit',
      run: async ({ state }) => {
        const { text } = await editor.run({
          prompt: `Draft:\n${state.draft}\n\nFeedback:\n${state.critique}`,
        });
        return { state: { final: text } };
      },
    }),
  ],
});

const result = await runWorkflow(wf, {
  onEvent: (e) => {
    if (e.type === 'node-start') console.log(`→ ${e.nodeId}`);
  },
});

console.log('\n--- topic ---\n' + result.state.topic);
console.log('\n--- outline ---\n' + result.state.outline);
console.log('\n--- draft ---\n' + result.state.draft);
console.log('\n--- critique ---\n' + result.state.critique);
console.log('\n--- final ---\n' + result.state.final);
console.log('\nfinishReason:', result.finishReason);
