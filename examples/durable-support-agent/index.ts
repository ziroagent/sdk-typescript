/**
 * Durable agent run + HITL resume using the same wiring as production Inngest:
 * `createInngestAgent` + `MemoryCheckpointer`.
 *
 * We use a tiny local `InngestClientLike` stub so you can run without
 * `inngest dev` — swap in `new Inngest({ id: '…' })` and HTTP `serve`
 * when you go live (see README).
 */

import { createAgent } from '@ziro-agent/agent';
import { MemoryCheckpointer } from '@ziro-agent/checkpoint-memory';
import type { LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import {
  createInngestAgent,
  InngestAgentSuspendedError,
  type InngestClientLike,
  type InngestStepLike,
} from '@ziro-agent/inngest';
import { defineTool } from '@ziro-agent/tools';
import { z } from 'zod';

const issueRefund = defineTool({
  name: 'issue_refund',
  description: 'Issue a refund for an order id.',
  input: z.object({ orderId: z.string(), reason: z.string() }),
  requiresApproval: true,
  execute: (i) => {
    console.log(`   [side-effect] Refund issued for order ${i.orderId}`);
    return { ok: true, refundId: `rf_${Date.now()}` };
  },
});

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

const refundToolCall: ModelGenerateResult = {
  text: '',
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call_refund_1',
      toolName: 'issue_refund',
      args: { orderId: 'ord_42', reason: 'customer complaint' },
    },
  ],
  toolCalls: [
    {
      type: 'tool-call',
      toolCallId: 'call_refund_1',
      toolName: 'issue_refund',
      args: { orderId: 'ord_42', reason: 'customer complaint' },
    },
  ],
  finishReason: 'tool-calls',
  usage: { promptTokens: 12, completionTokens: 12, totalTokens: 24 },
};

interface RegisteredFn {
  config: { id: string };
  trigger: { event: string };
  handler: (ctx: {
    event: { name: string; data: Record<string, unknown> };
    step: InngestStepLike;
  }) => Promise<unknown>;
}

function fakeInngest(): InngestClientLike & { registered: RegisteredFn[] } {
  const registered: RegisteredFn[] = [];
  return {
    registered,
    createFunction(config, trigger, handler) {
      const fn: RegisteredFn = {
        config: { id: config.id },
        trigger: trigger as { event: string },
        handler: handler as RegisteredFn['handler'],
      };
      registered.push(fn);
      return fn;
    },
  };
}

function memoStep(): InngestStepLike {
  const memo = new Map<string, unknown>();
  return {
    async run<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
      if (memo.has(id)) return memo.get(id) as T;
      const out = await fn();
      memo.set(id, out);
      return out;
    },
  };
}

async function main() {
  const checkpointer = new MemoryCheckpointer({ maxCheckpointsPerThread: 20 });
  const agent = createAgent({
    name: 'support',
    model: scriptedModel([refundToolCall, finalText('Refund completed — ticket closed.')]),
    tools: { issue_refund: issueRefund },
    checkpointer,
    defaultThreadId: 'default-thread',
  });

  const inngest = fakeInngest();
  createInngestAgent({ inngest, agent });

  const runFn = inngest.registered.find((f) => f.config.id === 'support:run');
  const resumeFn = inngest.registered.find((f) => f.config.id === 'support:resume');
  if (!runFn || !resumeFn) throw new Error('expected :run and :resume functions');

  const threadId = 'ticket:8812';
  console.log('\n=== 1) ziro/agent.run.requested (no approver → suspend) ===\n');

  try {
    await runFn.handler({
      event: {
        name: 'ziro/agent.run.requested',
        data: {
          threadId,
          prompt: 'Please issue a refund for order ord_42 — customer complaint.',
          budget: { maxUsdPerRun: 0.25 },
        },
      },
      step: memoStep(),
    });
    console.log('unexpected: run finished without suspension');
  } catch (err) {
    if (err instanceof InngestAgentSuspendedError) {
      console.log(
        `   caught InngestAgentSuspendedError — checkpointId=${err.checkpointId ?? '(none)'}`,
      );
      console.log(
        `   pending: ${err.snapshot.pendingApprovals.map((p) => `${p.toolName}(${p.toolCallId})`).join(', ')}`,
      );
    } else {
      throw err;
    }
  }

  console.log('\n=== 2) ziro/agent.resume.requested (human approved) ===\n');

  const resumeResult = await resumeFn.handler({
    event: {
      name: 'ziro/agent.resume.requested',
      data: {
        threadId,
        decisions: { call_refund_1: { decision: 'approve' } },
        budget: { maxUsdPerRun: 0.25 },
      },
    },
    step: memoStep(),
  });

  const done = resumeResult as { result?: { text: string; finishReason: string } };
  if (done.result) {
    console.log(`   finishReason=${done.result.finishReason}`);
    console.log(`   text → "${done.result.text}"`);
  } else {
    console.log('   unexpected resume payload:', resumeResult);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
