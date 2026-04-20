/**
 * `createNetwork` — multi-agent coordination via a deterministic,
 * function-form router (RFC 0007).
 *
 * Each step the router is consulted with the current conversation
 * state and decides which `Agent` (or `Agent[]` for parallel fan-out)
 * runs next. Returning `undefined` halts the network and emits the
 * final result.
 *
 * Explicitly NOT shipped (rejected in RFC 0007 §"Explicitly NOT
 * shipping"):
 *   - LLM-as-router: opaque per-step LLM cost, non-auditable control
 *     flow. Use a function-form router and embed an LLM call in your
 *     own `router` body if you need it.
 *   - Graph engine with conditional edges: `@ziro-agent/workflow`
 *     covers the small graph case.
 */
import type { ChatMessage } from '@ziro-agent/core';
import type { Agent, AgentRunOptions, AgentRunResult } from './agent.js';

export interface AgentRouterContext {
  /** Conversation state visible at this routing decision. */
  messages: ChatMessage[];
  /**
   * Free-form, mutable state the router can read AND write across
   * steps. `createNetwork` never reads from `state`; it's purely the
   * router's scratchpad. Persist it yourself (snapshot, durable
   * storage) if you need cross-process resumability.
   */
  state: Record<string, unknown>;
  /** 0-indexed step counter — `0` on the first router invocation. */
  stepIndex: number;
  /**
   * The agent that produced `lastResult`. `undefined` on the first
   * router invocation.
   */
  lastAgent?: Agent;
  /** The result produced by the previous step. `undefined` on step 0. */
  lastResult?: AgentRunResult;
}

/**
 * Pure routing function: given the current network context, return
 * the next agent (or array of agents to run in parallel), or
 * `undefined` to halt the network.
 *
 * Determinism is the contract: `router` MUST NOT call an LLM directly
 * — that's a separate primitive we explicitly chose not to build.
 * Embed branching logic on `state` / `stepIndex` / `lastResult`
 * instead.
 */
export type AgentRouter = (ctx: AgentRouterContext) => Agent | Agent[] | undefined;

export interface CreateNetworkOptions {
  agents: readonly Agent[];
  router: AgentRouter;
  /** Hard cap on router iterations. Default `25`. */
  maxSteps?: number;
}

export interface NetworkRunOptions extends Omit<AgentRunOptions, 'budget' | 'threadId'> {
  /**
   * Pre-populated state passed to the router on step 0. Subsequent
   * routers see whatever the previous router returned via mutation.
   */
  initialState?: Record<string, unknown>;
}

export interface NetworkStepRecord {
  stepIndex: number;
  /** Agents that ran this step — array because parallel fan-out is supported. */
  agents: readonly Agent[];
  /**
   * Results in the same order as `agents`. Single-agent steps still
   * use a length-1 array so consumers don't have to discriminate.
   */
  results: readonly AgentRunResult[];
}

export interface NetworkRunResult {
  /** The final assistant text — taken from the LAST step's first result. */
  text: string;
  steps: readonly NetworkStepRecord[];
  /** The final state object after the router halted. */
  state: Record<string, unknown>;
  /**
   * Reason the network stopped:
   *  - `'router-halt'`: router returned `undefined`.
   *  - `'maxSteps'`: hit `maxSteps` cap (router would have continued).
   */
  finishReason: 'router-halt' | 'maxSteps';
}

export interface Network {
  readonly agents: readonly Agent[];
  run(options: NetworkRunOptions): Promise<NetworkRunResult>;
}

export function createNetwork(options: CreateNetworkOptions): Network {
  const maxSteps = options.maxSteps ?? 25;

  return {
    agents: options.agents,
    async run(runOptions: NetworkRunOptions): Promise<NetworkRunResult> {
      const initialMessages: ChatMessage[] = [
        ...(runOptions.messages ?? []),
        ...(runOptions.prompt ? [{ role: 'user' as const, content: runOptions.prompt }] : []),
      ];

      const state = { ...(runOptions.initialState ?? {}) };
      const steps: NetworkStepRecord[] = [];
      let lastAgent: Agent | undefined;
      let lastResult: AgentRunResult | undefined;
      let messages: ChatMessage[] = initialMessages;
      let finishReason: NetworkRunResult['finishReason'] = 'router-halt';

      for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
        const decision = options.router({
          messages,
          state,
          stepIndex,
          ...(lastAgent ? { lastAgent } : {}),
          ...(lastResult ? { lastResult } : {}),
        });

        if (!decision) {
          finishReason = 'router-halt';
          break;
        }

        const targets = Array.isArray(decision) ? decision : [decision];
        if (targets.length === 0) {
          // Empty array is treated as a halt — same intent as
          // `undefined`, but a common bug surface (router that filters
          // an empty list); recording it keeps debugging easy.
          finishReason = 'router-halt';
          break;
        }

        // Run the targets — sequentially when one, in parallel when
        // many. We always pass the SAME messages array; each target's
        // sub-run can choose to ignore or filter via its own
        // `inputFilter` / handoffs.
        const results = await Promise.all(
          targets.map((target) =>
            target.run({
              messages,
              ...(runOptions.abortSignal ? { abortSignal: runOptions.abortSignal } : {}),
              ...(runOptions.metadata ? { metadata: runOptions.metadata } : {}),
              ...(runOptions.onEvent ? { onEvent: runOptions.onEvent } : {}),
            }),
          ),
        );

        steps.push({ stepIndex, agents: targets, results });

        // Pick the FIRST result as the canonical "last" — multi-agent
        // synthesis (e.g. a reducer hook) is an open question in
        // RFC 0007 and intentionally not part of this minimal cut.
        const primary = results[0];
        if (primary) {
          lastResult = primary;
          messages = primary.messages ?? messages;
        }
        const primaryAgent = targets[0];
        if (primaryAgent) lastAgent = primaryAgent;

        if (stepIndex === maxSteps - 1) {
          finishReason = 'maxSteps';
        }
      }

      return {
        text: lastResult?.text ?? '',
        steps,
        state,
        finishReason,
      };
    },
  };
}
