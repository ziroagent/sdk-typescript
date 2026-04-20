import type { Agent, AgentRunOptions, CheckpointId } from '@ziro-agent/agent';
import {
  type InngestStepLike,
  type ResumeAsStepOptions,
  type RunAsStepOptions,
  type RunAsStepResult,
  resumeAsStep,
  runAsStep,
} from './inngest-step.js';

/**
 * Minimal subset of an Inngest client we depend on. `createFunction`
 * mirrors the `Inngest` class exactly enough to register a function;
 * we do not type the full generic schema, only the shape the user
 * passes in. The real client is brought in via `peerDependencies`.
 */
export interface InngestClientLike {
  createFunction<R>(
    config: { id: string; name?: string; concurrency?: unknown; retries?: number },
    trigger: { event: string; if?: string } | { cron: string },
    handler: (ctx: {
      event: { name: string; data: Record<string, unknown> };
      step: InngestStepLike;
      runId?: string;
    }) => Promise<R>,
  ): unknown;
}

/**
 * Convenience options for {@link createInngestAgent}. Lets the caller
 * customise event names without restating the full Inngest function
 * config.
 */
export interface CreateInngestAgentOptions {
  /** Inngest client (`new Inngest({ id })`). */
  inngest: InngestClientLike;
  /** The agent to wire up. Must have a `Checkpointer` when `enableResume` is true. */
  agent: Agent;
  /**
   * Identifier for the registered Inngest functions. We append a
   * `:run` / `:resume` suffix to keep the two functions distinct in
   * the Inngest dashboard.
   *
   * Default: `agent.name` (the Ziro agent's `name` from `createAgent`).
   */
  functionId?: string;
  /**
   * Inngest event name that triggers a fresh agent run. Default
   * `ziro/agent.run.requested`. Event payload shape:
   *
   * ```ts
   * { name, data: { threadId, prompt?, messages?, metadata? } }
   * ```
   */
  runEvent?: string;
  /**
   * Inngest event name that triggers a resume. Default
   * `ziro/agent.resume.requested`. Event payload shape:
   *
   * ```ts
   * { name, data: { threadId, decisions, checkpointId? } }
   * ```
   */
  resumeEvent?: string;
  /**
   * When `false`, only the run function is registered. Default `true`.
   * Disable when the agent has no `checkpointer` and HITL is not used.
   */
  enableResume?: boolean;
}

/**
 * Register a pair of Inngest functions that wrap an {@link Agent} for
 * durable execution. The shape matches the patterns in Inngest's own
 * Agent Kit reference (event-driven invoke + resume) so existing
 * Inngest dashboards "just work".
 *
 * Returns the registered function objects so callers can pass them to
 * `serve({ functions: [...] })` from `inngest/next`, `inngest/express`,
 * etc.
 *
 * The HTTP layer (event ingestion, signing) is intentionally NOT
 * re-implemented here — Inngest already does it well, and the user
 * calls `inngest.send(...)` directly to fire events.
 */
export function createInngestAgent(options: CreateInngestAgentOptions): {
  runFn: unknown;
  resumeFn: unknown | null;
} {
  const functionId = options.functionId ?? options.agent.name;
  const runEvent = options.runEvent ?? 'ziro/agent.run.requested';
  const resumeEvent = options.resumeEvent ?? 'ziro/agent.resume.requested';
  const enableResume = options.enableResume ?? true;

  const runFn = options.inngest.createFunction<RunAsStepResult>(
    { id: `${functionId}:run`, retries: 3 },
    { event: runEvent },
    async ({ event, step }) => {
      const data = event.data as RunEventData;
      const runOptions: RunAsStepOptions = {
        ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
        ...(data.messages !== undefined ? { messages: data.messages } : {}),
        ...(data.threadId !== undefined ? { threadId: data.threadId } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      };
      return runAsStep(step, options.agent, runOptions);
    },
  );

  let resumeFn: unknown | null = null;
  if (enableResume) {
    if (!options.agent.checkpointer) {
      throw new Error(
        'createInngestAgent({ enableResume: true }) requires the Agent to have a `checkpointer`. ' +
          'Pass one to createAgent({ checkpointer }) or set enableResume: false.',
      );
    }
    resumeFn = options.inngest.createFunction<RunAsStepResult>(
      { id: `${functionId}:resume`, retries: 3 },
      { event: resumeEvent },
      async ({ event, step }) => {
        const data = event.data as unknown as ResumeEventData;
        if (!data.threadId) throw new Error(`${resumeEvent} requires data.threadId`);
        const resumeOptions: ResumeAsStepOptions & { checkpointId?: CheckpointId } = {
          decisions: data.decisions ?? {},
          ...(data.checkpointId !== undefined ? { checkpointId: data.checkpointId } : {}),
        };
        return resumeAsStep(step, options.agent, data.threadId, resumeOptions);
      },
    );
  }

  return { runFn, resumeFn };
}

/** Shape of the payload your producer should `inngest.send(...)` to trigger a run. */
export interface RunEventData {
  /** Forwarded to `agent.run({ threadId })` for checkpointer auto-persist. */
  threadId?: string;
  prompt?: AgentRunOptions['prompt'];
  messages?: AgentRunOptions['messages'];
  metadata?: AgentRunOptions['metadata'];
}

/** Shape of the payload your producer should `inngest.send(...)` to resume. */
export interface ResumeEventData {
  threadId: string;
  decisions?: Parameters<Agent['resume']>[1]['decisions'];
  checkpointId?: CheckpointId;
}
