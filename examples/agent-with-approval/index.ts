/**
 * Human-in-the-loop end-to-end demo for v0.1.7 (RFC 0002).
 *
 * Four sub-demos selectable via `DEMO=<name>`:
 *
 *   1. DEMO=approve   — inline `approver` callback approves the call;
 *                       `tool.execute()` runs in the same tick.
 *   2. DEMO=reject    — inline approver rejects; the LLM sees an error
 *                       tool message and continues with a fallback reply.
 *   3. DEMO=suspend   — no approver: the run throws `AgentSuspendedError`,
 *                       we serialize the snapshot to disk, simulate a
 *                       human pressing "approve" from another process,
 *                       then `agent.resume(snapshot, { decisions })`
 *                       continues the run.
 *   4. DEMO=budget    — same as #3 but with a budget that has already
 *                       hit `maxLlmCalls: 1` before suspension. Resume
 *                       carries usage forward via `presetUsage`, so the
 *                       second LLM call rejects with
 *                       `BudgetExceededError` — proving multi-day pauses
 *                       cannot bypass cost caps.
 *
 * Runs with no API key: every demo uses a scripted mock model.
 *
 *   pnpm --filter @ziro-agent/example-agent-with-approval demo:approve
 *   pnpm --filter @ziro-agent/example-agent-with-approval demo:reject
 *   pnpm --filter @ziro-agent/example-agent-with-approval demo:suspend
 *   pnpm --filter @ziro-agent/example-agent-with-approval demo:budget
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AgentSnapshot, AgentSuspendedError, createAgent } from '@ziro-agent/agent';
import {
  type Approver,
  BudgetExceededError,
  type LanguageModel,
  type ModelGenerateResult,
} from '@ziro-agent/core';
import { defineTool } from '@ziro-agent/tools';
import { instrumentApproval, instrumentBudget } from '@ziro-agent/tracing';
import { z } from 'zod';

// 0) Wire HITL + budget observers into the active tracer. With no OTel
//    SDK installed these are no-ops, but the observer hooks still fire.
const { unregister: unregApproval } = instrumentApproval();
const { unregister: unregBudget } = instrumentBudget();

// ---------- Tools ----------------------------------------------------------

const sendEmail = defineTool({
  name: 'send_email',
  description: 'Send an email to a recipient.',
  input: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
  // Boolean form: every send_email call needs human approval.
  requiresApproval: true,
  execute: (i) => {
    console.log(`   [side-effect] Email actually sent — to=${i.to} subject="${i.subject}"`);
    return { ok: true, messageId: `m_${Date.now()}` };
  },
});

const transferFunds = defineTool({
  name: 'transfer_funds',
  description: 'Move money between accounts.',
  input: z.object({
    from: z.string(),
    to: z.string(),
    amountUsd: z.number(),
  }),
  // Function form: only require approval for transfers > $100.
  requiresApproval: (input) => input.amountUsd > 100,
  execute: (i) => {
    console.log(`   [side-effect] Transfer executed — $${i.amountUsd} from ${i.from} → ${i.to}`);
    return { ok: true, txn: `tx_${Date.now()}` };
  },
});

// ---------- Mock model ------------------------------------------------------

function scriptedModel(responses: ModelGenerateResult[]): LanguageModel {
  let i = 0;
  return {
    modelId: 'mock-gpt',
    provider: 'mock',
    async generate(): Promise<ModelGenerateResult> {
      const r = responses[i++];
      if (!r) throw new Error('Mock model exhausted');
      return r;
    },
    async stream() {
      throw new Error('not implemented');
    },
    estimateCost: () => ({
      minUsd: 0.001,
      maxUsd: 0.001,
      minTokens: 10,
      maxTokens: 20,
      pricingAvailable: true,
    }),
  };
}

const finalText = (s: string): ModelGenerateResult => ({
  text: s,
  content: [{ type: 'text', text: s }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 8, completionTokens: 8, totalTokens: 16 },
});

const callEmailStep: ModelGenerateResult = {
  text: '',
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call_email_1',
      toolName: 'send_email',
      args: { to: 'ops@example.com', subject: 'q4 report', body: 'attached' },
    },
  ],
  toolCalls: [
    {
      type: 'tool-call',
      toolCallId: 'call_email_1',
      toolName: 'send_email',
      args: { to: 'ops@example.com', subject: 'q4 report', body: 'attached' },
    },
  ],
  finishReason: 'tool-calls',
  usage: { promptTokens: 12, completionTokens: 12, totalTokens: 24 },
};

// ---------- Demos -----------------------------------------------------------

async function demoApprove() {
  console.log('\n=== DEMO: inline approve ===');
  const approver: Approver = async (req) => {
    console.log(`   [approver] approving ${req.toolName}(${JSON.stringify(req.input)})`);
    return { decision: 'approve' };
  };
  const agent = createAgent({
    tools: { send_email: sendEmail },
    model: scriptedModel([callEmailStep, finalText('Done — email sent.')]),
  });
  const result = await agent.run({
    prompt: 'send the q4 report to ops',
    approver,
    agentId: 'demo-approve',
  });
  console.log(`   final → finishReason=${result.finishReason}, text="${result.text}"`);
}

async function demoReject() {
  console.log('\n=== DEMO: inline reject ===');
  const approver: Approver = async (req) => {
    console.log(`   [approver] REJECTING ${req.toolName} (policy violation)`);
    return { decision: 'reject', reason: 'External email needs manager sign-off' };
  };
  const agent = createAgent({
    tools: { send_email: sendEmail },
    model: scriptedModel([
      callEmailStep,
      finalText('I tried to send it but approval was declined; let me know how to proceed.'),
    ]),
  });
  const result = await agent.run({
    prompt: 'send the q4 report to ops',
    approver,
    agentId: 'demo-reject',
  });
  console.log(`   final → finishReason=${result.finishReason}, text="${result.text}"`);
}

async function demoSuspend() {
  console.log('\n=== DEMO: suspend → persist → resume ===');
  const agent = createAgent({
    tools: { send_email: sendEmail },
    model: scriptedModel([callEmailStep, finalText('All done — receipt logged.')]),
  });

  // 1) Run with NO approver — the agent suspends.
  let snapshot: AgentSnapshot | undefined;
  try {
    await agent.run({ prompt: 'send the q4 report to ops', agentId: 'demo-suspend' });
  } catch (err) {
    if (err instanceof AgentSuspendedError) {
      snapshot = err.snapshot;
      console.log(
        `   suspended at step ${snapshot.step}, ${snapshot.pendingApprovals.length} pending approval(s):`,
      );
      for (const p of snapshot.pendingApprovals) {
        console.log(`     · ${p.toolName}(${JSON.stringify(p.parsedInput)})`);
      }
    } else {
      throw err;
    }
  }
  if (!snapshot) throw new Error('expected suspension');

  // 2) Persist to disk — proving the snapshot is JSON-serializable. In a
  //    real product you'd write to Postgres/Redis/S3 here.
  const dir = join(tmpdir(), 'ziro-hitl-demo');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${snapshot.agentId ?? 'snapshot'}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  console.log(`   snapshot persisted → ${path}`);

  // 3) ...time passes. Imagine a human clicks "approve" in a UI; another
  //    process reads the snapshot back and resumes.
  const restored = JSON.parse(readFileSync(path, 'utf-8')) as AgentSnapshot;

  const result = await agent.resume(restored, {
    decisions: { call_email_1: { decision: 'approve' } },
  });
  console.log(`   resumed → finishReason=${result.finishReason}, text="${result.text}"`);
}

async function demoBudget() {
  console.log('\n=== DEMO: budget continuity across resume ===');
  // The agent is allowed exactly 1 LLM call. The first call (the one
  // that proposes the tool call) consumes that budget; the second call
  // after resume should overrun.
  const agent = createAgent({
    tools: { send_email: sendEmail },
    model: scriptedModel([callEmailStep, finalText('done')]),
  });

  let snapshot: AgentSnapshot | undefined;
  try {
    await agent.run({
      prompt: 'send it',
      agentId: 'demo-budget',
      budget: { maxLlmCalls: 1 },
    });
  } catch (err) {
    if (err instanceof AgentSuspendedError) snapshot = err.snapshot;
    else throw err;
  }
  if (!snapshot) throw new Error('expected suspension');
  console.log(`   suspended; budgetUsage so far → ${JSON.stringify(snapshot.budgetUsage)}`);

  try {
    await agent.resume(snapshot, {
      decisions: { call_email_1: { decision: 'approve' } },
      budget: { maxLlmCalls: 1 },
    });
    console.log('   resume completed — UNEXPECTED, budget should have tripped.');
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      console.log(
        `   resume rejected with BudgetExceededError ` +
          `(kind=${err.kind}, limit=${err.limit}, observed=${err.observed}) — ` +
          'preset usage prevented the bypass.',
      );
    } else {
      throw err;
    }
  }
}

// ---------- Entrypoint ------------------------------------------------------

async function main() {
  const which = process.env.DEMO ?? 'all';
  try {
    if (which === 'all' || which === 'approve') await demoApprove();
    if (which === 'all' || which === 'reject') await demoReject();
    if (which === 'all' || which === 'suspend') await demoSuspend();
    if (which === 'all' || which === 'budget') await demoBudget();
  } finally {
    unregApproval();
    unregBudget();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
