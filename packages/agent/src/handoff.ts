/**
 * Multi-agent handoffs (RFC 0007).
 *
 * Allows an agent to delegate the conversation to another, specialised
 * agent by exposing each handoff as an LLM-callable tool named
 * `transfer_to_<agentName>`. The LLM picks the next agent the same way
 * it picks any other tool, so the routing decision is auditable in the
 * standard step trace.
 *
 * Per-handoff `inputFilter(messages)` controls how much of the parent's
 * message history is forwarded to the target agent — the documented
 * mitigation for context-pollution failure modes.
 *
 * Explicitly out of scope here: LLM-as-router (rejected in RFC 0007
 * §"Explicitly NOT shipping") and a graph engine (deferred to
 * `@ziro-agent/workflow`).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { ChatMessage } from '@ziro-agent/core';
import { defineTool, type Tool } from '@ziro-agent/tools';
import { z } from 'zod';
import type { Agent, AgentRunResult } from './agent.js';

/**
 * Either an `Agent` (default `inputFilter` = passthrough) or an
 * explicit `HandoffSpec` for fine-grained control.
 */
export type Handoff = Agent | HandoffSpec;

export interface HandoffSpec {
  /** Target sub-agent. Required. */
  agent: Agent;
  /**
   * Transform the parent's message history before the sub-agent sees
   * it. Default: passthrough. Common patterns:
   *
   *   `(msgs) => msgs.slice(-10)`           // last 10 messages only
   *   `(msgs) => msgs.filter(m => m.role !== 'system')`  // strip parent's system prompt
   *
   * Documented production failure mode this mitigates: context
   * pollution (sub-agent's reasoning derailed by irrelevant earlier
   * turns).
   */
  inputFilter?: (messages: ChatMessage[]) => ChatMessage[];
  /**
   * Override the auto-derived tool description shown to the LLM.
   * Default: `"Transfer the conversation to the <name> agent. Use
   * when the user's request requires its specialised capabilities."`
   */
  description?: string;
}

/**
 * Frame pushed onto AsyncLocalStorage for the duration of a single
 * agent run, so handoff tools (which receive only `(input, ctx)`) can
 * still see the parent's current `messages` and forward them.
 *
 * Internal — not exported from the package.
 */
export interface HandoffFrame {
  messages: ChatMessage[];
  /** Depth of nested handoff calls. Used by `maxHandoffDepth` guard. */
  depth: number;
  /**
   * Shared mutable sink. Every frame opened during a single top-level
   * `agent.run()` (including all nested handoff calls) points to the
   * SAME object — mutating it is therefore visible to every enclosing
   * agent loop, regardless of how deeply nested the throw originated.
   *
   * The `executeToolCalls` layer flattens any thrown `Error` to a
   * plain `{ name, message }` (cross-realm safety) — losing the
   * original `HandoffLoopError` instance. We stash the live error
   * here BEFORE throwing so every parent agent loop above the
   * deepest handoff can re-throw the rich object verbatim.
   *
   * @internal
   */
  loopErrorSink: { error?: HandoffLoopError };
}

/** @internal */
export const handoffStore = new AsyncLocalStorage<HandoffFrame>();

/**
 * Thrown when a chain of handoffs exceeds `maxHandoffDepth`. Helps
 * catch the "triage agent calls itself" recursive misconfiguration
 * before it costs real money.
 */
export class HandoffLoopError extends Error {
  override readonly name = 'HandoffLoopError';
  readonly depth: number;
  readonly maxDepth: number;
  readonly chain: readonly string[];

  constructor(args: { depth: number; maxDepth: number; chain: readonly string[] }) {
    super(
      `Handoff depth ${args.depth} exceeded max ${args.maxDepth}. ` +
        `Chain: ${args.chain.join(' → ')}. ` +
        `Configure CreateAgentOptions.maxHandoffDepth or fix the loop.`,
    );
    this.depth = args.depth;
    this.maxDepth = args.maxDepth;
    this.chain = args.chain;
  }
}

const handoffInputSchema = z.object({
  reason: z
    .string()
    .optional()
    .describe('Optional one-sentence justification for choosing this agent.'),
});

/**
 * Build the LLM-facing tool that, when invoked, runs the target agent
 * with the (filtered) message history and returns its `text` output as
 * the tool result.
 *
 * The tool name follows the convention
 * `transfer_to_<sanitised_agent_name>` — sanitisation lower-cases and
 * replaces non-`[a-z0-9_]` runs with `_`, matching OpenAI's function
 * name rules.
 *
 * @internal — exported for tests; not part of the public API.
 */
export function buildHandoffTool(
  handoff: Handoff,
  options: { maxHandoffDepth: number; parentChain: readonly string[] },
): Tool {
  const isSpec = !isAgentLike(handoff);
  const target = isSpec ? handoff.agent : handoff;
  const inputFilter = isSpec ? handoff.inputFilter : undefined;
  const description =
    (isSpec ? handoff.description : undefined) ??
    `Transfer the conversation to the ${target.name} agent. Use when the user's request requires its specialised capabilities.`;

  const toolName = handoffToolName(target.name);

  return defineTool({
    name: toolName,
    description,
    input: handoffInputSchema,
    async execute(_args, ctx) {
      const frame = handoffStore.getStore();
      if (!frame) {
        // Should be unreachable: the agent loop always wraps execution
        // in `handoffStore.run`. Surface loudly if it ever happens.
        throw new Error(
          `Handoff tool "${toolName}" was invoked outside of an agent run scope. ` +
            `This is a bug in @ziro-agent/agent — please file an issue.`,
        );
      }

      const nextDepth = frame.depth + 1;
      const nextChain = [...options.parentChain, target.name];
      if (nextDepth > options.maxHandoffDepth) {
        const loopErr = new HandoffLoopError({
          depth: nextDepth,
          maxDepth: options.maxHandoffDepth,
          chain: nextChain,
        });
        // Stash on the SHARED sink so every enclosing agent loop can
        // re-throw the rich instance even after `executeToolCalls`
        // flattens our thrown error to `{ name, message }`.
        frame.loopErrorSink.error = loopErr;
        throw loopErr;
      }

      const filtered = inputFilter ? inputFilter(frame.messages) : frame.messages;

      // We deliberately do NOT forward `budget` here: the parent's
      // BudgetSpec already lives in AsyncLocalStorage via `withBudget`,
      // and `target.run()` will compose into the same scope through
      // `intersectSpecs`. Re-passing it would double-wrap and silently
      // halve `maxUsd` because of intersection semantics.
      const subResult: AgentRunResult = await handoffStore.run(
        {
          messages: filtered,
          depth: nextDepth,
          // Crucial: nested frame keeps the SAME sink reference so
          // depth-N writes are visible to every depth-<N agent loop.
          loopErrorSink: frame.loopErrorSink,
        },
        () =>
          target.run({
            messages: filtered,
            ...(ctx.abortSignal ? { abortSignal: ctx.abortSignal } : {}),
            ...(ctx.metadata ? { metadata: ctx.metadata } : {}),
          }),
      );

      // The parent agent receives the sub-agent's final text as the
      // tool result. Step traces and tracing spans capture the full
      // sub-run separately via `instrumentAgent()`.
      return subResult.text;
    },
  });
}

/**
 * Sanitise an agent name into a valid OpenAI function name fragment
 * (lower-case, `[a-z0-9_]` only). Empty input falls back to `agent`.
 */
export function handoffToolName(agentName: string): string {
  const cleaned = agentName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `transfer_to_${cleaned || 'agent'}`;
}

/**
 * Structural test: is this a bare `Agent` (vs a `HandoffSpec`)? Uses
 * the `run` method as the discriminator — `Agent` always has it,
 * `HandoffSpec` never does at top-level.
 */
function isAgentLike(handoff: Handoff): handoff is Agent {
  return typeof (handoff as Agent).run === 'function';
}
