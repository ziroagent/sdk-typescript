import type { LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import { ATTR, type SpanLike, setTracer, type ZiroTracer } from '@ziro-agent/tracing';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgent } from './agent.js';
import { HandoffLoopError, handoffToolName } from './handoff.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  ended: boolean;
}

function recordingTracer(): ZiroTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const make = (name: string): SpanLike => {
    const rec: RecordedSpan = { name, attributes: {}, ended: false };
    spans.push(rec);
    return {
      setAttribute(k, v) {
        rec.attributes[k] = v;
      },
      setAttributes(a) {
        Object.assign(rec.attributes, a);
      },
      setStatus() {},
      recordException() {},
      addEvent() {},
      end() {
        rec.ended = true;
      },
    };
  };
  return {
    spans,
    startSpan(n) {
      return make(n);
    },
    async withSpan(n, fn) {
      const s = make(n);
      try {
        return await fn(s);
      } finally {
        s.end();
      }
    },
  };
}

/** See agent.approval.test.ts for the canonical scriptedModel. */
function scriptedModel(responses: ModelGenerateResult[]): LanguageModel {
  let i = 0;
  return {
    modelId: 'mock',
    provider: 'mock',
    async generate(): Promise<ModelGenerateResult> {
      const r = responses[i++];
      if (!r) throw new Error(`Mock model exhausted (called ${i} times)`);
      return r;
    },
    async stream() {
      throw new Error('not implemented');
    },
  };
}

const finalText = (s: string): ModelGenerateResult => ({
  text: s,
  content: [{ type: 'text', text: s }],
  toolCalls: [],
  finishReason: 'stop',
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
});

const toolCallStep = (
  calls: Array<{ id: string; name: string; args: unknown }>,
): ModelGenerateResult => ({
  text: '',
  content: calls.map((c) => ({
    type: 'tool-call',
    toolCallId: c.id,
    toolName: c.name,
    args: c.args,
  })),
  toolCalls: calls.map((c) => ({
    type: 'tool-call' as const,
    toolCallId: c.id,
    toolName: c.name,
    args: c.args,
  })),
  finishReason: 'tool-calls',
  usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
});

describe('handoffs (RFC 0007)', () => {
  describe('handoffToolName', () => {
    it('lowercases + sanitises non-[a-z0-9_] characters', () => {
      expect(handoffToolName('Billing Agent')).toBe('transfer_to_billing_agent');
      expect(handoffToolName('tech-support/v2')).toBe('transfer_to_tech_support_v2');
      expect(handoffToolName('UPPER_CASE')).toBe('transfer_to_upper_case');
    });

    it('falls back to "agent" when name is empty after sanitisation', () => {
      expect(handoffToolName('---')).toBe('transfer_to_agent');
      expect(handoffToolName('')).toBe('transfer_to_agent');
    });
  });

  describe('createAgent({ handoffs })', () => {
    it('exposes one transfer_to_* tool per handoff in agent.tools', () => {
      const billing = createAgent({
        name: 'billing',
        model: scriptedModel([finalText('billing-done')]),
      });
      const tech = createAgent({
        name: 'tech',
        model: scriptedModel([finalText('tech-done')]),
      });
      const triage = createAgent({
        name: 'triage',
        model: scriptedModel([finalText('triage-done')]),
        handoffs: [billing, tech],
      });
      expect(Object.keys(triage.tools).sort()).toEqual(['transfer_to_billing', 'transfer_to_tech']);
    });

    it('LLM-invoked handoff runs the target sub-agent and returns its text as the tool result', async () => {
      const specialist = createAgent({
        name: 'specialist',
        model: scriptedModel([finalText('specialist answer')]),
      });
      const triage = createAgent({
        name: 'triage',
        handoffs: [specialist],
        model: scriptedModel([
          // Step 1: LLM picks the handoff tool.
          toolCallStep([{ id: 'h1', name: 'transfer_to_specialist', args: {} }]),
          // Step 2: After the handoff returns, parent wraps up.
          finalText('handed off & wrapped up'),
        ]),
      });

      const result = await triage.run({ prompt: 'help me' });
      expect(result.text).toBe('handed off & wrapped up');
      expect(result.steps).toHaveLength(2);
      const toolStep = result.steps[0];
      const toolResult = toolStep?.toolResults?.[0];
      expect(toolResult?.toolName).toBe('transfer_to_specialist');
      expect(toolResult?.result).toBe('specialist answer');
      expect(toolResult?.isError).toBe(false);
    });

    it('inputFilter narrows the message history forwarded to the sub-agent', async () => {
      const captured: { messages: unknown[] | null } = { messages: null };
      const specialist = createAgent({
        name: 'specialist',
        model: {
          modelId: 'mock',
          provider: 'mock',
          async generate(opts) {
            captured.messages = opts.messages;
            return finalText('done');
          },
          async stream() {
            throw new Error('not implemented');
          },
        },
      });
      const triage = createAgent({
        name: 'triage',
        handoffs: [
          {
            agent: specialist,
            // Drop the system prompt + only forward the most recent user turn.
            inputFilter: (msgs) => msgs.filter((m) => m.role === 'user').slice(-1),
          },
        ],
        system: 'You are a router.',
        model: scriptedModel([
          toolCallStep([{ id: 'h1', name: 'transfer_to_specialist', args: {} }]),
          finalText('done at parent'),
        ]),
      });

      await triage.run({ prompt: 'second user message' });
      expect(captured.messages).toBeTruthy();
      // Sub-agent should see ONLY the filtered slice (1 user msg) plus
      // its own system prompt (none here) — so length === 1.
      expect((captured.messages as unknown[]).length).toBe(1);
      expect((captured.messages as Array<{ role: string }>)[0]?.role).toBe('user');
    });

    it('throws HandoffLoopError when nested handoffs exceed maxHandoffDepth', async () => {
      // Build the chain bottom-up so each level has a real handoff tool
      // pointing to the deeper agent: depth0 → depth1 → depth2 → depth3.
      // With maxHandoffDepth=2 the depth-3 transition must throw.
      const handoffOnly = (toolName: string): LanguageModel => ({
        modelId: 'mock',
        provider: 'mock',
        async generate() {
          return toolCallStep([{ id: 'h', name: toolName, args: {} }]);
        },
        async stream() {
          throw new Error('not implemented');
        },
      });

      const leaf = createAgent({
        name: 'leaf',
        model: scriptedModel([finalText('done')]),
      });
      const depth2 = createAgent({
        name: 'depth2',
        model: handoffOnly('transfer_to_leaf'),
        handoffs: [leaf],
        maxHandoffDepth: 2,
      });
      const depth1 = createAgent({
        name: 'depth1',
        model: handoffOnly('transfer_to_depth2'),
        handoffs: [depth2],
        maxHandoffDepth: 2,
      });
      const depth0 = createAgent({
        name: 'depth0',
        model: handoffOnly('transfer_to_depth1'),
        handoffs: [depth1],
        maxHandoffDepth: 2,
      });

      await expect(depth0.run({ prompt: 'go' })).rejects.toBeInstanceOf(HandoffLoopError);
    });

    it('throws on tool-name collision between user tools and handoffs', () => {
      const sub = createAgent({ name: 'support', model: scriptedModel([finalText('x')]) });
      expect(() =>
        createAgent({
          name: 'parent',
          model: scriptedModel([finalText('x')]),
          handoffs: [sub],
          tools: {
            transfer_to_support: {
              __ziro_tool__: true,
              name: 'transfer_to_support',
              input: { parse: (v: unknown) => v } as never,
              execute: () => 'noop',
            },
          },
        }),
      ).toThrow(/collides/);
    });

    it('agent.name defaults to "agent" when omitted', () => {
      const a = createAgent({ model: scriptedModel([finalText('x')]) });
      expect(a.name).toBe('agent');
    });
  });

  describe('tracing', () => {
    afterEach(() => setTracer(null));

    it('emits ziro.agent.handoff span with parent/target/depth/chain attrs', async () => {
      const tracer = recordingTracer();
      setTracer(tracer);

      const billing = createAgent({
        name: 'billing',
        model: scriptedModel([finalText('refund issued')]),
      });
      const triage = createAgent({
        name: 'triage',
        handoffs: [billing],
        maxHandoffDepth: 3,
        model: scriptedModel([
          toolCallStep([
            {
              id: 'h1',
              name: 'transfer_to_billing',
              args: { reason: 'user wants a refund' },
            },
          ]),
          finalText('done'),
        ]),
      });

      await triage.run({ prompt: 'I want my money back' });

      const handoffSpan = tracer.spans.find((s) => s.name === 'ziro.agent.handoff');
      expect(handoffSpan, 'expected one ziro.agent.handoff span').toBeTruthy();
      expect(handoffSpan?.ended).toBe(true);
      expect(handoffSpan?.attributes[ATTR.HandoffParentAgent]).toBe('triage');
      expect(handoffSpan?.attributes[ATTR.HandoffTargetAgent]).toBe('billing');
      expect(handoffSpan?.attributes[ATTR.HandoffDepth]).toBe(1);
      expect(handoffSpan?.attributes[ATTR.HandoffMaxDepth]).toBe(3);
      expect(handoffSpan?.attributes[ATTR.HandoffChain]).toBe('triage>billing');
      expect(handoffSpan?.attributes[ATTR.HandoffReason]).toBe('user wants a refund');
      expect(handoffSpan?.attributes[ATTR.HandoffFiltered]).toBe(false);
    });

    it('marks HandoffFiltered=true when an inputFilter is supplied', async () => {
      const tracer = recordingTracer();
      setTracer(tracer);

      const sub = createAgent({
        name: 'sub',
        model: scriptedModel([finalText('ok')]),
      });
      const parent = createAgent({
        name: 'parent',
        handoffs: [{ agent: sub, inputFilter: (msgs) => msgs.slice(-1) }],
        model: scriptedModel([
          toolCallStep([{ id: 'h1', name: 'transfer_to_sub', args: {} }]),
          finalText('done'),
        ]),
      });

      await parent.run({ prompt: 'go' });

      const span = tracer.spans.find((s) => s.name === 'ziro.agent.handoff');
      expect(span?.attributes[ATTR.HandoffFiltered]).toBe(true);
    });
  });
});
