/**
 * Multi-agent handoff (RFC 0007) end-to-end demo.
 *
 * Topology:
 *
 *     ┌─────────┐  transfer_to_billing   ┌─────────┐
 *     │ triage  │ ─────────────────────▶ │ billing │
 *     └─────────┘  transfer_to_tech      └─────────┘
 *          │                            ┌──────────────┐
 *          └──────────────────────────▶ │ tech_support │
 *                                       └──────────────┘
 *
 * The triage agent reads the user's message, picks the right specialist
 * via a `transfer_to_<name>` tool call, and returns whatever the
 * specialist produces. No graph engine, no router LLM — handoffs[] just
 * exposes specialists as tools, the parent LLM picks one.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... pnpm --filter @ziro-agent/example-multi-agent-handoff start
 *
 * With OTel tracing:
 *   OPENAI_API_KEY=sk-... pnpm --filter @ziro-agent/example-multi-agent-handoff start:traced
 */

import { createAgent } from '@ziro-agent/agent';
import { createOpenAI } from '@ziro-agent/openai';
import { defineTool } from '@ziro-agent/tools';
import { z } from 'zod';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Set OPENAI_API_KEY before running this example.');
  process.exit(1);
}

const openai = createOpenAI({ apiKey });
const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini');

// --- specialist 1: billing ------------------------------------------------
const issueRefund = defineTool({
  name: 'issue_refund',
  description: 'Issue a refund for a given order. Returns a confirmation id.',
  input: z.object({
    orderId: z.string().describe('The order id, e.g. ORD-1234'),
    reasonCode: z.enum(['damaged', 'wrong_item', 'late', 'other']),
  }),
  async execute({ orderId, reasonCode }) {
    // Pretend we hit a real refund API.
    return { confirmationId: `REF-${Date.now().toString(36)}`, orderId, reasonCode };
  },
});

const billing = createAgent({
  name: 'billing',
  model,
  system:
    'You are the billing specialist. Resolve refund / invoice questions. ' +
    'Use the `issue_refund` tool when the user asks for one. ' +
    'Be concise — one paragraph maximum.',
  tools: { issue_refund: issueRefund },
});

// --- specialist 2: tech_support ------------------------------------------
const lookupTicket = defineTool({
  name: 'lookup_ticket',
  description: 'Look up a support ticket by id.',
  input: z.object({ ticketId: z.string() }),
  async execute({ ticketId }) {
    return {
      ticketId,
      status: 'open',
      lastUpdate: '2026-04-19',
      summary: 'User reports the device fails to pair after firmware 4.2 upgrade.',
    };
  },
});

const techSupport = createAgent({
  name: 'tech_support',
  model,
  system:
    'You are the technical support specialist. Diagnose device issues. ' +
    'If the user mentions a ticket id, call `lookup_ticket` first. ' +
    'Keep your reply under 4 sentences.',
  tools: { lookup_ticket: lookupTicket },
});

// --- triage ---------------------------------------------------------------
const triage = createAgent({
  name: 'triage',
  model,
  system:
    'You are the triage agent. ' +
    'For billing / refund / invoice questions, call `transfer_to_billing`. ' +
    'For device / setup / connectivity questions, call `transfer_to_tech_support`. ' +
    'Do NOT answer billing or technical questions yourself — always transfer. ' +
    'For pure greetings or unrelated questions, answer briefly without transferring.',
  handoffs: [
    // Bare Agent ⇒ default `inputFilter` forwards the parent's full
    // message history so the specialist has context.
    billing,
    // HandoffSpec ⇒ override the description for nicer LLM behaviour.
    {
      agent: techSupport,
      description:
        'Transfer to the technical support specialist. Use for ' +
        'connectivity, pairing, firmware, or device-setup issues.',
    },
  ],
  // Stop infinite handoff bouncing if a sub-agent ever calls back into us.
  maxHandoffDepth: 3,
});

// --- run a small scripted conversation -----------------------------------
const queries = [
  'Hi, can I get a refund for order ORD-9931? It arrived damaged.',
  "My speaker won't pair after the 4.2 firmware update — ticket TKT-883.",
  "Hey, what's up?",
];

for (const q of queries) {
  console.log(`\n────────────────────────────────────────`);
  console.log(`USER: ${q}`);
  const result = await triage.run({ prompt: q });

  // Surface any handoff that happened so the demo is more readable.
  for (const step of result.steps) {
    for (const r of step.toolResults ?? []) {
      if (r.toolName.startsWith('transfer_to_')) {
        const target = r.toolName.replace(/^transfer_to_/, '');
        console.log(`→ HANDOFF to "${target}"`);
      }
    }
  }
  console.log(`TRIAGE: ${result.text}`);
  console.log(
    `(${result.steps.length} step${result.steps.length === 1 ? '' : 's'}, ` +
      `${result.totalUsage.totalTokens} tokens, finish=${result.finishReason})`,
  );
}
