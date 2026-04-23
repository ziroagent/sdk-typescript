import {
  type ApprovalDecision,
  type Approver,
  BudgetExceededError,
  type BudgetSpec,
  type BudgetUsage,
  type ChatMessage,
  fireAgentResumed,
  fireAgentSuspended,
  generateText,
  getCurrentBudget,
  type LanguageModel,
  type PendingApproval,
  type SerializableBudgetSpec,
  type TextPart,
  type TokenUsage,
  type ToolCallPart,
  type ToolResultPart,
  withBudget,
} from '@ziro-agent/core';
import type { AgentMemoryConfig } from '@ziro-agent/memory';
import { injectWorkingMemoryIntoMessages, type MemoryProcessor } from '@ziro-agent/memory';
import {
  executeToolCalls,
  type RepairToolCall,
  type Tool,
  type ToolExecutionResult,
} from '@ziro-agent/tools';
import { ATTR, getTracer, instrumentTools } from '@ziro-agent/tracing';
import type { Checkpointer, CheckpointId, CheckpointMeta } from './checkpointer.js';
import { buildHandoffTool, type Handoff, handoffStore } from './handoff.js';
import { type PrepareStep, resolvePrepareForStep } from './prepare-step.js';
import {
  type AgentResumeOptions,
  type AgentSnapshot,
  AgentSuspendedError,
  CURRENT_SNAPSHOT_VERSION,
  migrateSnapshot,
} from './snapshot.js';
import type { StopWhen } from './stop-when.js';
import type {
  AgentBudgetExceededInfo,
  AgentFinishReason,
  AgentStep,
  StepEvent,
  StepEventListener,
} from './types.js';

export interface CreateAgentOptions {
  model: LanguageModel;
  tools?: Record<string, Tool>;
  /**
   * Stable, human-readable agent name. Used for:
   *  - Auto-generating handoff tool names (`transfer_to_<name>`).
   *  - Tracing / log correlation (`ziro.agent.name` attribute).
   *
   * Recommended convention: short, snake_case-ish (e.g. `triage`,
   * `billing`, `tech_support`). Defaults to `agent` when omitted; this
   * is fine for single-agent setups but causes tool-name collisions
   * when used in `handoffs[]` — supply a unique name in that case.
   */
  name?: string;
  /**
   * Specialised sub-agents the LLM may delegate the conversation to
   * via auto-generated `transfer_to_<name>` tools. Pass either a bare
   * `Agent` (full message-history passthrough) or a {@link HandoffSpec}
   * for `inputFilter` / custom description. See RFC 0007.
   *
   * Available since v0.2.0.
   */
  handoffs?: Handoff[];
  /**
   * Hard cap on the depth of nested handoffs in a single run. Throws
   * `HandoffLoopError` if exceeded. Default `5`.
   */
  maxHandoffDepth?: number;
  /** System message passed to the model on every step. */
  system?: string;
  /** Hard cap on iterations. Default 10. */
  maxSteps?: number;
  /**
   * Predicate evaluated after every step; return true to stop early.
   * Combine with `stepCountIs`, `totalTokensExceeds`, etc.
   */
  stopWhen?: StopWhen;
  /**
   * Invoked before each LLM step. Return a partial result to swap `model`,
   * replace the first system message for that call, or restrict which tool
   * names are exposed (RFC 0004 `prepareStep` adoption matrix).
   */
  prepareStep?: PrepareStep;
  /** Default temperature for every step. */
  temperature?: number;
  /** Per-step LLM call timeout. Set 0 / undefined to disable. */
  timeoutMs?: number;
  /**
   * Optional persistence boundary. When supplied, every
   * `AgentSuspendedError` thrown by `run()` / `resume()` automatically
   * `put`s its snapshot under `runOptions.threadId` (or the agent-level
   * `defaultThreadId`) before re-throwing — so the caller can recover
   * with `agent.resumeFromCheckpoint(threadId)` after a process restart
   * without writing any persistence glue.
   *
   * Future strategies (`'message'` / `'invocation'` per RFC 0006
   * §strategies) auto-checkpoint inside the loop too; they ship in v0.2
   * once `AgentSnapshot` captures non-suspended mid-run state.
   *
   * Available since v0.1.9.
   */
  checkpointer?: Checkpointer;
  /**
   * Default thread id used by `checkpointer` when neither `run` nor
   * `resume` overrides it. Useful when an agent instance is dedicated
   * to a single conversation; otherwise pass `threadId` per-call.
   */
  defaultThreadId?: string;
  /**
   * Optional three-tier memory (RFC 0011). Working memory is merged into the
   * first `system` message each LLM step; memory processors and conversation
   * transforms run on a copy — full history stays in `AgentRunResult.messages`
   * and checkpoints.
   */
  memory?: AgentMemoryConfig;
  /**
   * When `true`, every tool (including auto-generated handoff tools) is wrapped
   * with `instrumentTools` from `@ziro-agent/tracing`. Until `setTracer(...)` is
   * installed, spans are no-ops. Default `false` so callers who already pass
   * `instrumentTools(...)` maps do not double-wrap.
   */
  traceTools?: boolean;
  /**
   * Default {@link RepairToolCall} for every `run()` / `resume()` unless
   * overridden per-call on {@link AgentRunOptions} / {@link AgentResumeOptions}.
   */
  repairToolCall?: RepairToolCall;
}

export interface AgentRunOptions {
  /** Either a single user prompt or a full message list. */
  prompt?: string;
  messages?: ChatMessage[];
  abortSignal?: AbortSignal;
  /** Subscribe to fine-grained step events while the agent runs. */
  onEvent?: StepEventListener;
  /**
   * Per-run override of {@link CreateAgentOptions.prepareStep}. When both are
   * set, this wins.
   */
  prepareStep?: PrepareStep;
  /**
   * Budget enforced across the entire run: every nested `generateText` and
   * `executeToolCalls` invocation participates in the same scope via
   * `AsyncLocalStorage`. See RFC 0001.
   *
   * `BudgetSpec.maxSteps` is honored here (it is intentionally ignored at
   * the `generateText` layer). If both `maxSteps` on `CreateAgentOptions`
   * and on `budget` are set, the tighter wins.
   */
  budget?: BudgetSpec;
  /**
   * Per-tool-call default budget. Composed (intersected) with each tool's
   * declared `defineTool({ budget })` and with the outer agent budget.
   * Most useful as a "safety net" against a single rogue tool burning the
   * whole agent budget.
   */
  toolBudget?: BudgetSpec;
  /**
   * Resolves `tool.requiresApproval` gates inline. When unset and any
   * tool needs approval, the agent suspends with `AgentSuspendedError`
   * (carrying a serializable `AgentSnapshot`). See RFC 0002.
   */
  approver?: Approver;
  /**
   * Stable id stamped onto any `AgentSnapshot` produced during this run
   * (for the caller's storage layer). Optional.
   */
  agentId?: string;
  /**
   * Per-call thread id for `checkpointer` auto-persist. Falls back to
   * `CreateAgentOptions.defaultThreadId`. When neither is set, an
   * agent-level `checkpointer` is a no-op (the snapshot still arrives
   * via `AgentSuspendedError` so callers may persist manually).
   */
  threadId?: string;
  /**
   * Free-form metadata propagated to the approver and tool-execute ctx.
   */
  metadata?: Record<string, unknown>;
  /** Per-run override of {@link CreateAgentOptions.repairToolCall}. */
  repairToolCall?: RepairToolCall;
}

export interface AgentRunResult {
  /** Final assistant text — concatenated from the last step. */
  text: string;
  /** Every step the agent took, in order. */
  steps: AgentStep[];
  /** Sum of token usage across every LLM call. */
  totalUsage: TokenUsage;
  /** Why the loop terminated. */
  finishReason: AgentFinishReason;
  /** Final conversation, including system, user, assistant, and tool messages. */
  messages: ChatMessage[];
  /**
   * Populated when the loop terminated via `onExceed: 'truncate'`. With the
   * default `'throw'` semantics, the run rejects with `BudgetExceededError`
   * instead and this field is never reached.
   */
  budgetExceeded?: AgentBudgetExceededInfo;
}

export interface ResumeFromCheckpointOptions extends AgentResumeOptions {
  /**
   * When omitted, loads the latest checkpoint for the thread. Pass an
   * id to resume from a specific point (useful for retry experiments).
   */
  checkpointId?: CheckpointId;
}

export interface Agent {
  /**
   * Stable, human-readable agent name (default `'agent'`). Drives
   * handoff tool naming and tracing attributes.
   */
  readonly name: string;
  readonly tools: Record<string, Tool>;
  /**
   * The {@link Checkpointer} the agent was created with, or `undefined`
   * when none was supplied. Re-exposed so callers can manually `list`
   * / `delete` checkpoints without holding a separate reference.
   */
  readonly checkpointer?: Checkpointer;
  /**
   * Same object passed to `createAgent({ memory })`. `longTerm` is for app
   * tools and RAG; working and conversation tiers are applied inside the loop.
   */
  readonly memory?: AgentMemoryConfig;
  run(options: AgentRunOptions): Promise<AgentRunResult>;
  /**
   * Continue an agent run that was suspended via `AgentSuspendedError`.
   * `decisions` must contain a decision for every tool call in
   * `snapshot.pendingApprovals`; missing entries default to
   * `{ decision: 'suspend' }` and the loop will re-emit a fresh
   * suspension error. See RFC 0002.
   */
  resume(snapshot: AgentSnapshot, options: AgentResumeOptions): Promise<AgentRunResult>;
  /**
   * Convenience wrapper around `checkpointer.get(threadId, ?id)` +
   * `resume(snapshot, options)`. Throws `Error("No checkpoint found ...")`
   * when no snapshot exists for the thread — callers should treat that
   * as "nothing to resume from" and fall back to a fresh `run()`.
   *
   * Requires the agent to have been created with a `checkpointer`.
   *
   * Available since v0.1.9.
   */
  resumeFromCheckpoint(
    threadId: string,
    options: ResumeFromCheckpointOptions,
  ): Promise<AgentRunResult>;
  /**
   * Lists checkpoint metadata for a thread (newest first). Delegates to
   * {@link Checkpointer.list}; use this when you only hold the `Agent`
   * reference.
   *
   * Requires `createAgent({ checkpointer })`.
   */
  listCheckpoints(threadId: string, opts?: { limit?: number }): Promise<CheckpointMeta[]>;
}

/**
 * Mutable, in-flight loop state shared between the initial `run` path and
 * the `resume` path. Both entry points populate this and then hand it to
 * `iterateLoop` which runs the standard `generateText → executeToolCalls`
 * loop from `nextStepIndex` to `stepCap`.
 */
interface LoopState {
  messages: ChatMessage[];
  steps: AgentStep[];
  totalUsage: TokenUsage;
  /** 1-indexed; the iteration starts at this step number. */
  nextStepIndex: number;
  /** Effective step cap = min(CreateAgent.maxSteps, BudgetSpec.maxSteps). */
  stepCap: number;
  finishReason: AgentFinishReason;
  budgetInfo?: AgentBudgetExceededInfo;
  /**
   * Tool results produced **before** entering iterateLoop (e.g. by
   * `resume` after applying the human decisions). When non-empty, the
   * loop appends them as a tool message and synthesizes a step before
   * making any new LLM call.
   */
  pendingToolResults?: ToolExecutionResult[];
  /**
   * Tool calls that produced the `pendingToolResults` above (so the
   * synthesized step has accurate `toolCalls`).
   */
  pendingToolCalls?: ToolCallPart[];
}

let warnedUncappedBudgetThisProcess = false;

/**
 * RFC 0001 §Unresolved Q1: optional `budget` stays for prototyping, but the
 * first top-level uncapped `agent.run` per process emits a one-time warning.
 * Suppressed under Vitest (`VITEST=true`) or when `ZIRO_SUPPRESS_UNCAPPED_BUDGET_WARN=1`.
 */
function maybeWarnUncappedBudget(agentName: string, runOptions: AgentRunOptions): void {
  if (warnedUncappedBudgetThisProcess) return;
  if (runOptions.budget !== undefined) return;
  if (getCurrentBudget() !== undefined) return;
  if (process.env.VITEST === 'true') return;
  if (process.env.ZIRO_SUPPRESS_UNCAPPED_BUDGET_WARN === '1') return;
  warnedUncappedBudgetThisProcess = true;
  process.emitWarning(
    `[ziro-agent] "${agentName}" agent.run() was called without a budget (uncapped until v1.0). ` +
      'Pass { budget: { maxUsdPerRun: number } } or set ZIRO_SUPPRESS_UNCAPPED_BUDGET_WARN=1 to silence. See rfcs/0001-budget-guard.md.',
    { type: 'ZiroBudget', code: 'ZIRO_UNCAPPED_AGENT_BUDGET' },
  );
}

/**
 * Create a tool-using agent. Internally runs a `generateText → executeToolCalls`
 * loop, threading messages back to the model until either:
 *   - the model returns no tool calls (natural completion)
 *   - `stopWhen` returns true
 *   - `maxSteps` is reached
 *   - `abortSignal` fires
 *   - a tool call requires human approval (`AgentSuspendedError` thrown — RFC 0002)
 */
export function createAgent(options: CreateAgentOptions): Agent {
  const agentName = options.name ?? 'agent';
  const baseMaxSteps = options.maxSteps ?? 10;
  const checkpointer = options.checkpointer;
  const maxHandoffDepth = options.maxHandoffDepth ?? 5;

  // Merge user-supplied tools with auto-generated handoff tools.
  // Handoff tool names follow `transfer_to_<sanitised_name>` and would
  // collide noisily with user tools — fail fast if so.
  const baseTools: Record<string, Tool> = { ...(options.tools ?? {}) };
  if (options.handoffs?.length) {
    for (const h of options.handoffs) {
      const tool = buildHandoffTool(h, {
        maxHandoffDepth,
        parentChain: [agentName],
      });
      if (tool.name in baseTools) {
        throw new Error(
          `Handoff tool name "${tool.name}" collides with an existing tool. ` +
            `Either rename the user tool or set a unique \`name\` on the target agent.`,
        );
      }
      baseTools[tool.name] = tool;
    }
  }
  const tools = options.traceTools === true ? instrumentTools(baseTools) : baseTools;
  const agentRepairDefault = options.repairToolCall;

  /**
   * Auto-persist the snapshot from any `AgentSuspendedError` thrown by
   * `fn` so the caller can later `agent.resumeFromCheckpoint(threadId)`.
   *
   * No-ops when no `checkpointer` is configured, or when neither the
   * agent-level `defaultThreadId` nor a per-call `threadId` is set —
   * the snapshot still arrives via the thrown error so manual storage
   * is always possible.
   *
   * Persistence failure is logged on `console.error` and does NOT mask
   * the original `AgentSuspendedError`: durability is best-effort, the
   * ground truth is the in-flight error.
   */
  const withAutoCheckpoint = async (
    threadId: string | undefined,
    fn: () => Promise<AgentRunResult>,
  ): Promise<AgentRunResult> => {
    try {
      return await fn();
    } catch (err) {
      if (checkpointer && threadId && err instanceof AgentSuspendedError) {
        try {
          await checkpointer.put(threadId, err.snapshot);
        } catch (persistErr) {
          // Don't shadow the original suspension — persistence is
          // best-effort. Surface the failure so ops can see it.
          // eslint-disable-next-line no-console
          console.error('[ziro-agent] checkpointer.put failed:', persistErr);
        }
      }
      throw err;
    }
  };

  const agent: Agent = {
    name: agentName,
    tools,
    ...(checkpointer ? { checkpointer } : {}),
    ...(options.memory ? { memory: options.memory } : {}),
    async run(runOptions: AgentRunOptions): Promise<AgentRunResult> {
      maybeWarnUncappedBudget(agentName, runOptions);
      const exec = async (): Promise<AgentRunResult> => {
        const state = seedFromRunOptions(runOptions, baseMaxSteps);
        return await iterateLoop(state, runOptions);
      };
      const tid = runOptions.threadId ?? options.defaultThreadId;
      // Wrap the run in a fresh handoff frame ONLY when one isn't
      // already in scope — nested handoff calls (the sub-agent's run)
      // already established the frame in `buildHandoffTool.execute`,
      // and over-writing it here would reset the depth counter and
      // break `maxHandoffDepth` enforcement.
      const wrapHandoff = (fn: () => Promise<AgentRunResult>): Promise<AgentRunResult> => {
        if (handoffStore.getStore() !== undefined) return fn();
        const initialMessages = runOptions.messages ?? [];
        return handoffStore.run({ messages: initialMessages, depth: 0, loopErrorSink: {} }, fn);
      };
      return await wrapHandoff(() =>
        withAutoCheckpoint(tid, () => runWithBudget(runOptions, exec)),
      );
    },

    async resume(
      rawSnapshot: AgentSnapshot,
      resumeOptions: AgentResumeOptions,
    ): Promise<AgentRunResult> {
      // Forward-migrate so the rest of this method only deals with the
      // current snapshot shape. v1 snapshots persisted before v0.1.9
      // resume transparently (their `resolvedSiblings[].parsedArgs` is
      // simply undefined; `seedFromSnapshot` falls back to the pre-v2
      // behaviour for those entries).
      const snapshot = migrateSnapshot(rawSnapshot);

      // Build a `runOptions`-shaped object so the rest of the loop sees
      // a uniform interface. We keep the snapshot-derived budget as a
      // fallback if the caller didn't re-supply one.
      const resolvedBudget =
        resumeOptions.budget ?? deserializeBudgetSpec(snapshot.budgetSpec) ?? undefined;
      const resumeRepair =
        resumeOptions.repairToolCall !== undefined
          ? resumeOptions.repairToolCall
          : agentRepairDefault;
      const cleanRo: AgentRunOptions = {
        ...(resumeOptions.toolBudget !== undefined ? { toolBudget: resumeOptions.toolBudget } : {}),
        ...(resumeOptions.approver !== undefined ? { approver: resumeOptions.approver } : {}),
        ...(resumeOptions.abortSignal !== undefined
          ? { abortSignal: resumeOptions.abortSignal }
          : {}),
        ...(resumeOptions.onEvent !== undefined ? { onEvent: resumeOptions.onEvent } : {}),
        ...(resumeOptions.prepareStep !== undefined
          ? { prepareStep: resumeOptions.prepareStep }
          : {}),
        ...(resumeOptions.metadata !== undefined ? { metadata: resumeOptions.metadata } : {}),
        ...(resumeRepair ? { repairToolCall: resumeRepair } : {}),
        ...(snapshot.agentId !== undefined ? { agentId: snapshot.agentId } : {}),
        ...(resolvedBudget !== undefined ? { budget: resolvedBudget } : {}),
      };

      const exec = async (): Promise<AgentRunResult> => {
        const decisions = resumeOptions.decisions ?? {};
        const decisionCounts = countDecisions(decisions, snapshot.pendingApprovals);

        // Resolve every pending tool call into a real ToolExecutionResult,
        // collecting any that turn into NEW pending approvals so we can
        // re-suspend with a refreshed snapshot.
        const newlyResolved: ToolExecutionResult[] = [];
        const stillPending: PendingApproval[] = [];
        for (const pending of snapshot.pendingApprovals) {
          const decision = decisions[pending.toolCallId] ?? { decision: 'suspend' };
          const result = await applyDecisionToPending(tools, pending, decision, cleanRo);
          if (result.pendingApproval) {
            stillPending.push(result.pendingApproval);
            // Don't append a tool result for still-pending calls.
          } else {
            newlyResolved.push(result);
          }
        }

        if (stillPending.length > 0) {
          // Re-throw with an updated snapshot — the previously-resolved
          // siblings stay in `resolvedSiblings`, and the newly-resolved
          // ones are merged in too so resume #2 doesn't re-run them.
          const merged: AgentSnapshot = {
            ...snapshot,
            createdAt: new Date().toISOString(),
            pendingApprovals: stillPending,
            resolvedSiblings: [...snapshot.resolvedSiblings, ...newlyResolved],
          };
          fireAgentSuspended({
            ...(snapshot.agentId !== undefined ? { agentId: snapshot.agentId } : {}),
            ...(snapshot.scopeId !== undefined ? { scopeId: snapshot.scopeId } : {}),
            step: snapshot.step,
            pendingCount: stillPending.length,
          });
          throw new AgentSuspendedError({ snapshot: merged });
        }

        // Combine resolved siblings + newly-resolved into a single tool
        // message + synthesized step, then continue the loop.
        const allResults = [...snapshot.resolvedSiblings, ...newlyResolved];
        const state = seedFromSnapshot(snapshot, allResults, baseMaxSteps);

        fireAgentResumed({
          ...(snapshot.agentId !== undefined ? { agentId: snapshot.agentId } : {}),
          ...(snapshot.scopeId !== undefined ? { scopeId: snapshot.scopeId } : {}),
          step: snapshot.step,
          decisionCounts,
        });

        return await iterateLoop(state, cleanRo);
      };

      // Resume opens its own budget scope with the snapshot's accumulated
      // usage carried forward, so a multi-day pause cannot bypass maxUsd.
      const tid = snapshot.agentId ? undefined : options.defaultThreadId;
      // Note: we don't pull threadId from resumeOptions because the
      // canonical thread identity is established at run time. If the
      // caller wants to retarget, they can manually checkpointer.put
      // after a successful resume.
      return await withAutoCheckpoint(tid, () =>
        runWithBudget(cleanRo, exec, snapshot.budgetUsage),
      );
    },

    async resumeFromCheckpoint(
      threadId: string,
      resumeOptions: ResumeFromCheckpointOptions,
    ): Promise<AgentRunResult> {
      if (!checkpointer) {
        throw new Error(
          'agent.resumeFromCheckpoint() requires a `checkpointer` on createAgent({ checkpointer }).',
        );
      }
      const snap = await checkpointer.get(threadId, resumeOptions.checkpointId);
      if (!snap) {
        throw new Error(
          `No checkpoint found for thread "${threadId}"` +
            (resumeOptions.checkpointId ? ` (id "${resumeOptions.checkpointId}")` : '') +
            '. Treat this as "nothing to resume from" and call agent.run() instead.',
        );
      }
      // Strip our own option before forwarding so AgentResumeOptions
      // stays clean.
      const { checkpointId: _ignored, ...rest } = resumeOptions;
      return await this.resume(snap, rest);
    },

    async listCheckpoints(threadId: string, opts?: { limit?: number }): Promise<CheckpointMeta[]> {
      if (!checkpointer) {
        throw new Error(
          'agent.listCheckpoints() requires a `checkpointer` on createAgent({ checkpointer }).',
        );
      }
      return checkpointer.list(threadId, opts);
    },
  };

  return agent;

  // ============================================================
  // Loop implementation — shared between `run` and `resume`.
  // (Function declarations are hoisted; placement after `return`
  //  keeps the public surface readable up top.)
  // ============================================================

  async function buildLlmMessages(
    state: LoopState,
    ro: AgentRunOptions,
    stepIndex: number,
  ): Promise<ChatMessage[]> {
    const mem = options.memory;
    if (!mem) return state.messages;
    const tracer = getTracer();
    const ctx = { threadId: ro.threadId ?? options.defaultThreadId, stepIndex };
    const processors = mem.processors ?? [];
    const procCount = processors.length;

    return tracer.withSpan(
      'ziro.memory.build_llm_messages',
      async (root) => {
        root.setAttributes({
          [ATTR.AgentStepIndex]: stepIndex,
          [ATTR.MemoryProcessorCount]: procCount,
          ...(ctx.threadId ? { [ATTR.ThreadId]: ctx.threadId } : {}),
        });

        let msgs: ChatMessage[] = [...state.messages];
        const workingMem = mem.working;
        if (workingMem) {
          msgs = await tracer.withSpan(
            'ziro.memory.working',
            async (span) => {
              span.setAttributes({
                [ATTR.MemoryPhase]: 'working',
                ...(ctx.threadId ? { [ATTR.ThreadId]: ctx.threadId } : {}),
              });
              const w = await workingMem.read();
              return injectWorkingMemoryIntoMessages(msgs, w);
            },
            { kind: 'internal' },
          );
        }

        let idx = 0;
        for (const p of processors) {
          const i = idx;
          idx += 1;
          const proc = p as MemoryProcessor;
          msgs = await tracer.withSpan(
            'ziro.memory.processor',
            async (span) => {
              span.setAttributes({
                [ATTR.MemoryPhase]: 'processor',
                [ATTR.MemoryProcessorIndex]: i,
                [ATTR.MemoryProcessorCount]: procCount,
                ...(proc.name ? { [ATTR.MemoryProcessorName]: proc.name } : {}),
                ...(ctx.threadId ? { [ATTR.ThreadId]: ctx.threadId } : {}),
              });
              return await Promise.resolve(proc.process(msgs, ctx));
            },
            { kind: 'internal' },
          );
        }

        const conversationMem = mem.conversation;
        if (conversationMem) {
          msgs = await tracer.withSpan(
            'ziro.memory.conversation',
            async (span) => {
              span.setAttributes({
                [ATTR.MemoryPhase]: 'conversation',
                ...(ctx.threadId ? { [ATTR.ThreadId]: ctx.threadId } : {}),
              });
              return await Promise.resolve(conversationMem.prepareForModel(msgs, ctx));
            },
            { kind: 'internal' },
          );
        }
        return msgs;
      },
      { kind: 'internal' },
    );
  }

  async function iterateLoop(state: LoopState, ro: AgentRunOptions): Promise<AgentRunResult> {
    const effectiveRepairToolCall = ro.repairToolCall ?? agentRepairDefault;
    const emit = async (event: StepEvent) => {
      if (ro.onEvent) await ro.onEvent(event);
    };

    const truncate = ro.budget?.onExceed === 'truncate';
    const captureSnapshot = (): AgentRunResult => ({
      text: state.steps[state.steps.length - 1]?.text ?? '',
      steps: state.steps,
      totalUsage: state.totalUsage,
      finishReason: state.finishReason,
      messages: state.messages,
    });

    const handleBudgetThrow = async (
      err: BudgetExceededError,
      origin: AgentBudgetExceededInfo['origin'],
    ): Promise<undefined> => {
      const info = toAgentBudgetInfo(err, origin);
      await emit({ type: 'budget-exceeded', info });
      if (truncate) {
        state.budgetInfo = info;
        state.finishReason = 'budgetExceeded';
        return undefined;
      }
      (err as BudgetExceededError & { __agentPartial?: AgentRunResult }).__agentPartial =
        captureSnapshot();
      throw err;
    };

    // If the seeding code (e.g. `resume`) handed us pre-resolved tool
    // results for a step that already happened, replay them as a
    // synthesized step BEFORE entering the LLM-call loop.
    if (state.pendingToolResults && state.pendingToolCalls) {
      const replayResults = state.pendingToolResults;
      const replayCalls = state.pendingToolCalls;
      const stepIdx = state.nextStepIndex - 1; // the suspended step

      for (const r of replayResults) {
        await emit({ type: 'tool-result', index: stepIdx, result: r });
      }
      const toolContent: ToolResultPart[] = replayResults.map((r) => ({
        type: 'tool-result',
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        result: r.result,
        ...(r.isError ? { isError: true } : {}),
      }));
      state.messages.push({ role: 'tool', content: toolContent });

      const synthStep: AgentStep = {
        index: stepIdx,
        text: '',
        content: replayCalls,
        toolCalls: replayCalls,
        toolResults: replayResults,
        finishReason: 'tool-calls',
        usage: {},
      };
      state.steps.push(synthStep);
      await emit({ type: 'step-finish', step: synthStep });

      // Promote tool budget overruns to a loop-level halt, same as the
      // standard path below.
      const toolBudgetHit = replayResults.find((r) => r.budgetExceeded);
      if (toolBudgetHit?.budgetExceeded) {
        const synthErr = synthBudgetErrorFromToolResult(toolBudgetHit, state);
        await handleBudgetThrow(synthErr, 'tool');
        return finalizeResult(state, emit);
      }

      // Pre-resolved results consumed; clear so they don't replay.
      state.pendingToolResults = undefined;
      state.pendingToolCalls = undefined;
    }

    for (let i = state.nextStepIndex - 1; i < state.stepCap; i++) {
      if (ro.abortSignal?.aborted) {
        state.finishReason = 'aborted';
        break;
      }

      const stepIndex = i + 1;
      await emit({ type: 'step-start', index: stepIndex });

      const baseMsgs = await buildLlmMessages(state, ro, stepIndex);
      const prepare = ro.prepareStep ?? options.prepareStep;
      const {
        messages: stepMsgs,
        model: stepModel,
        toolsForStep,
        toolDefs: stepToolDefs,
      } = await resolvePrepareForStep(prepare, stepIndex, baseMsgs, options.model, tools);

      let llmResult: Awaited<ReturnType<typeof generateText>>;
      try {
        llmResult = await generateText({
          model: stepModel,
          messages: stepMsgs,
          ...(stepToolDefs ? { tools: stepToolDefs } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(ro.abortSignal ? { abortSignal: ro.abortSignal } : {}),
        });
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          await handleBudgetThrow(err, 'preflight');
          break;
        }
        throw err;
      }

      addUsageInPlace(state.totalUsage, llmResult.usage);

      await emit({
        type: 'llm-finish',
        index: stepIndex,
        text: llmResult.text,
        toolCalls: llmResult.toolCalls,
      });

      if (llmResult.toolCalls.length > 0) {
        const assistantContent = llmResult.content.filter(
          (p): p is TextPart | ToolCallPart => p.type === 'text' || p.type === 'tool-call',
        );
        state.messages.push({ role: 'assistant', content: assistantContent });
      } else {
        state.messages.push({ role: 'assistant', content: llmResult.text });
      }

      let toolResults: ToolExecutionResult[] = [];
      if (llmResult.toolCalls.length > 0) {
        const approvalContext = {
          step: stepIndex,
          messages: [...state.messages] as ReadonlyArray<unknown>,
        };
        // Refresh the handoff frame's `messages` snapshot BEFORE
        // running tools so any handoff-derived tool sees the latest
        // conversation state. We only mutate the existing frame —
        // never create a new one — so depth tracking is preserved.
        const frame = handoffStore.getStore();
        if (frame) frame.messages = [...state.messages];
        toolResults = await executeToolCalls({
          tools: toolsForStep,
          toolCalls: llmResult.toolCalls,
          step: stepIndex,
          ...(ro.abortSignal ? { abortSignal: ro.abortSignal } : {}),
          ...(ro.toolBudget ? { toolBudget: ro.toolBudget } : {}),
          ...(ro.approver ? { approver: ro.approver } : {}),
          ...(ro.metadata ? { metadata: ro.metadata } : {}),
          ...(effectiveRepairToolCall ? { repairToolCall: effectiveRepairToolCall } : {}),
          approvalContext,
        });

        for (const r of toolResults) {
          await emit({ type: 'tool-result', index: stepIndex, result: r });
        }

        // Suspension check — RFC 0002. If any result carries a
        // pendingApproval, the loop captures full state and throws
        // AgentSuspendedError. Sibling results that already executed
        // are preserved in `snapshot.resolvedSiblings`.
        const pending = toolResults.filter((r) => r.pendingApproval);
        if (pending.length > 0) {
          const resolvedSiblings = toolResults.filter((r) => !r.pendingApproval);
          const snap: AgentSnapshot = {
            version: CURRENT_SNAPSHOT_VERSION,
            __ziro_snapshot__: true,
            ...(ro.agentId !== undefined ? { agentId: ro.agentId } : {}),
            createdAt: new Date().toISOString(),
            ...(getCurrentBudget()?.scopeId
              ? { scopeId: getCurrentBudget()?.scopeId as string }
              : {}),
            step: stepIndex,
            messages: [...state.messages],
            steps: [...state.steps],
            totalUsage: { ...state.totalUsage },
            ...(getCurrentBudget()?.used !== undefined
              ? { budgetUsage: { ...(getCurrentBudget()?.used as BudgetUsage) } }
              : {}),
            ...(ro.budget ? { budgetSpec: serializeBudgetSpec(ro.budget) } : {}),
            pendingApprovals: pending.map((r) => r.pendingApproval as PendingApproval),
            resolvedSiblings,
          };
          fireAgentSuspended({
            ...(snap.agentId !== undefined ? { agentId: snap.agentId } : {}),
            ...(snap.scopeId !== undefined ? { scopeId: snap.scopeId } : {}),
            step: snap.step,
            pendingCount: pending.length,
          });
          throw new AgentSuspendedError({ snapshot: snap });
        }

        const toolContent: ToolResultPart[] = toolResults.map((r) => ({
          type: 'tool-result',
          toolCallId: r.toolCallId,
          toolName: r.toolName,
          result: r.result,
          ...(r.isError ? { isError: true } : {}),
        }));
        state.messages.push({ role: 'tool', content: toolContent });
      }

      const step: AgentStep = {
        index: stepIndex,
        text: llmResult.text,
        content: llmResult.content,
        toolCalls: llmResult.toolCalls,
        toolResults,
        finishReason: llmResult.finishReason,
        usage: llmResult.usage,
      };
      state.steps.push(step);
      await emit({ type: 'step-finish', step });

      const toolBudgetHit = toolResults.find((r) => r.budgetExceeded);
      if (toolBudgetHit?.budgetExceeded) {
        const synthErr = synthBudgetErrorFromToolResult(toolBudgetHit, state);
        await handleBudgetThrow(synthErr, 'tool');
        break;
      }

      // RFC 0007: HandoffLoopError is a configuration bug, not a
      // recoverable tool error — abort the run rather than letting
      // it loop until maxSteps. The `executeToolCalls` layer
      // serialises thrown Errors into plain `{ name, message }`
      // (cross-realm safety), so the live instance is stashed on the
      // shared `loopErrorSink` walked through every nested frame;
      // we re-throw it verbatim here.
      const liveLoopError = handoffStore.getStore()?.loopErrorSink.error;
      if (liveLoopError) throw liveLoopError;

      if (llmResult.toolCalls.length === 0) {
        state.finishReason = 'completed';
        break;
      }

      if (
        options.stopWhen &&
        (await options.stopWhen({ steps: state.steps, totalUsage: state.totalUsage }))
      ) {
        state.finishReason = 'stopWhen';
        break;
      }

      if (i === state.stepCap - 1) {
        state.finishReason = 'maxSteps';
        break;
      }
    }

    return finalizeResult(state, emit);
  }

  // ============================================================
  // Helpers — closure-scoped over `tools`/`baseMaxSteps`/`options`.
  // ============================================================

  function seedFromRunOptions(ro: AgentRunOptions, baseMaxSteps: number): LoopState {
    const messages: ChatMessage[] = [];
    if (options.system) messages.push({ role: 'system', content: options.system });
    if (ro.messages?.length) {
      messages.push(...ro.messages);
    } else if (ro.prompt) {
      messages.push({ role: 'user', content: ro.prompt });
    } else {
      throw new Error('createAgent.run requires either `prompt` or `messages`.');
    }
    const stepCap =
      ro.budget?.maxSteps !== undefined ? Math.min(baseMaxSteps, ro.budget.maxSteps) : baseMaxSteps;
    return {
      messages,
      steps: [],
      totalUsage: {},
      nextStepIndex: 1,
      stepCap,
      finishReason: 'completed',
    };
  }

  function seedFromSnapshot(
    snapshot: AgentSnapshot,
    resolvedResults: ToolExecutionResult[],
    baseMaxSteps: number,
  ): LoopState {
    // Reconstruct the toolCalls array from the snapshot's pending
    // approvals + the resolvedSiblings that already ran. Order: matches
    // the order of `resolvedResults`.
    //
    // v2: each ToolExecutionResult carries `parsedArgs` so we can echo
    // the validated input the tool actually received. v1 snapshots lack
    // it — `args` falls back to undefined (pre-v0.1.9 behaviour).
    const toolCalls: ToolCallPart[] = resolvedResults.map((r) => ({
      type: 'tool-call' as const,
      toolCallId: r.toolCallId,
      toolName: r.toolName,
      args: r.parsedArgs as unknown,
    }));
    const stepCap =
      snapshot.budgetSpec?.maxSteps !== undefined
        ? Math.min(baseMaxSteps, snapshot.budgetSpec.maxSteps)
        : baseMaxSteps;
    return {
      messages: [...snapshot.messages],
      steps: [...snapshot.steps],
      totalUsage: { ...snapshot.totalUsage },
      nextStepIndex: snapshot.step + 1,
      stepCap,
      finishReason: 'completed',
      pendingToolResults: resolvedResults,
      pendingToolCalls: toolCalls,
    };
  }

  async function finalizeResult(
    state: LoopState,
    emit: (event: StepEvent) => Promise<void>,
  ): Promise<AgentRunResult> {
    await emit({ type: 'agent-finish', reason: state.finishReason });
    const last = state.steps[state.steps.length - 1];
    return {
      text: last?.text ?? '',
      steps: state.steps,
      totalUsage: state.totalUsage,
      finishReason: state.finishReason,
      messages: state.messages,
      ...(state.budgetInfo ? { budgetExceeded: state.budgetInfo } : {}),
    };
  }
}

// ============================================================
// Module-level helpers (shared between run + resume).
// ============================================================

/**
 * Wrap `exec` in a `withBudget` scope honouring the user's `onExceed`
 * settings (throw / truncate / function form). Used by both `run` and
 * `resume`. `presetUsage` is supplied by `resume` so accumulated spend
 * carries across a HITL pause.
 */
async function runWithBudget(
  ro: AgentRunOptions,
  exec: () => Promise<AgentRunResult>,
  presetUsage?: BudgetUsage,
): Promise<AgentRunResult> {
  if (!ro.budget) return await exec();
  try {
    return await withBudget(
      ro.budget,
      exec,
      presetUsage !== undefined ? { presetUsage } : undefined,
    );
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) throw err;
    const onExceed = ro.budget.onExceed;

    if (typeof onExceed === 'function') {
      const ctx = {
        spec: ro.budget,
        used: err.partialUsage,
        remaining: computeRemaining(ro.budget, err.partialUsage),
        scopeId: err.scopeId,
      };
      let resolution: { handled: boolean; replacement?: unknown };
      try {
        resolution = await Promise.resolve(onExceed(ctx));
      } catch (resolverErr) {
        if (resolverErr instanceof Error) {
          (resolverErr as Error & { cause?: unknown }).cause = err;
        }
        throw resolverErr;
      }
      if (resolution.handled) return resolution.replacement as AgentRunResult;
      throw err;
    }

    if (onExceed === 'truncate') {
      const partial = (err as BudgetExceededError & { __agentPartial?: AgentRunResult })
        .__agentPartial;
      if (partial) {
        return {
          ...partial,
          finishReason: 'budgetExceeded',
          budgetExceeded: toAgentBudgetInfo(err, 'preflight'),
        };
      }
      return {
        text: '',
        steps: [],
        totalUsage: {},
        messages: [],
        finishReason: 'budgetExceeded',
        budgetExceeded: toAgentBudgetInfo(err, 'preflight'),
      };
    }
    throw err;
  }
}

/**
 * Run a single pending tool through the user-supplied decision, returning
 * a `ToolExecutionResult` ready to splice into the conversation. Mirrors
 * `executeToolCalls`'s behaviour for the approve/reject paths so the
 * tool-message shape stays uniform between run and resume.
 *
 * `suspend` decisions yield a result whose `pendingApproval` is set —
 * the caller (`agent.resume`) detects this and re-suspends.
 */
async function applyDecisionToPending(
  tools: Record<string, Tool>,
  pending: PendingApproval,
  decision: ApprovalDecision,
  ro: AgentRunOptions,
): Promise<ToolExecutionResult> {
  const start = performance.now();
  const tool = tools[pending.toolName];
  if (!tool) {
    return {
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      result: {
        name: 'ToolMissing',
        message:
          `Tool "${pending.toolName}" was not registered on the agent that ` +
          'received this resume call.',
      },
      isError: true,
      durationMs: performance.now() - start,
    };
  }

  if (decision.decision === 'reject') {
    return {
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      result: {
        name: 'ApprovalRejected',
        message: decision.reason ?? `Tool "${pending.toolName}" rejected by approver.`,
      },
      isError: true,
      durationMs: performance.now() - start,
      parsedArgs: pending.parsedInput,
    };
  }

  if (decision.decision === 'suspend') {
    return {
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      result: null,
      isError: false,
      durationMs: performance.now() - start,
      parsedArgs: pending.parsedInput,
      pendingApproval: pending,
    };
  }

  // approve — re-validate any modifiedInput so the tool gets a typed
  // payload at runtime.
  let approvedInput = pending.parsedInput;
  if (decision.modifiedInput !== undefined) {
    try {
      approvedInput = tool.input.parse(decision.modifiedInput);
    } catch (err) {
      return {
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        result: serializeError(err),
        isError: true,
        durationMs: performance.now() - start,
        parsedArgs: pending.parsedInput,
      };
    }
  }

  const composedBudget = ro.toolBudget ?? tool.budget ?? undefined;
  const runExecute = async (): Promise<unknown> => {
    const value = await Promise.resolve(
      tool.execute(approvedInput, {
        toolCallId: pending.toolCallId,
        ...(ro.abortSignal ? { abortSignal: ro.abortSignal } : {}),
        ...(ro.metadata ? { metadata: ro.metadata } : {}),
      }),
    );
    return tool.output ? tool.output.parse(value) : value;
  };
  try {
    const out = composedBudget ? await withBudget(composedBudget, runExecute) : await runExecute();
    return {
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      result: out,
      isError: false,
      durationMs: performance.now() - start,
      parsedArgs: approvedInput,
    };
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return {
        toolCallId: pending.toolCallId,
        toolName: pending.toolName,
        result: serializeError(err),
        isError: true,
        durationMs: performance.now() - start,
        parsedArgs: approvedInput,
        budgetExceeded: {
          kind: err.kind,
          limit: err.limit,
          observed: err.observed,
          scopeId: err.scopeId,
        },
      };
    }
    return {
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      result: serializeError(err),
      isError: true,
      durationMs: performance.now() - start,
      parsedArgs: approvedInput,
    };
  }
}

function countDecisions(
  decisions: Record<string, ApprovalDecision>,
  pending: PendingApproval[],
): { approve: number; reject: number; suspend: number } {
  const counts = { approve: 0, reject: 0, suspend: 0 };
  for (const p of pending) {
    const d = decisions[p.toolCallId]?.decision ?? 'suspend';
    counts[d as 'approve' | 'reject' | 'suspend']++;
  }
  return counts;
}

function synthBudgetErrorFromToolResult(
  toolResult: ToolExecutionResult,
  state: LoopState,
): BudgetExceededError {
  const be = toolResult.budgetExceeded;
  if (!be) {
    throw new Error('synthBudgetErrorFromToolResult called without budgetExceeded');
  }
  return new BudgetExceededError({
    kind: be.kind,
    limit: be.limit,
    observed: be.observed,
    scopeId: be.scopeId,
    partialUsage: getCurrentBudget()?.used ?? {
      usd: 0,
      tokens: 0,
      llmCalls: 0,
      steps: state.steps.length,
      durationMs: 0,
    },
    preflight: false,
  });
}

function toAgentBudgetInfo(
  err: BudgetExceededError,
  origin: AgentBudgetExceededInfo['origin'],
): AgentBudgetExceededInfo {
  return {
    kind: err.kind,
    limit: err.limit,
    observed: err.observed,
    scopeId: err.scopeId,
    partialUsage: err.partialUsage,
    origin,
  };
}

/**
 * Build a `BudgetContext.remaining` snapshot from the spec + observed usage.
 * Mirrors the math in `core/src/budget/scope.ts#toContext` so user-visible
 * resolver context shape stays consistent across layers.
 */
function computeRemaining(
  spec: BudgetSpec,
  used: BudgetUsage,
): {
  usd?: number;
  tokens?: number;
  llmCalls?: number;
  steps?: number;
  durationMs?: number;
} {
  const out: {
    usd?: number;
    tokens?: number;
    llmCalls?: number;
    steps?: number;
    durationMs?: number;
  } = {};
  if (spec.maxUsd !== undefined) out.usd = Math.max(0, spec.maxUsd - used.usd);
  if (spec.maxTokens !== undefined) out.tokens = Math.max(0, spec.maxTokens - used.tokens);
  if (spec.maxLlmCalls !== undefined) out.llmCalls = Math.max(0, spec.maxLlmCalls - used.llmCalls);
  if (spec.maxSteps !== undefined) out.steps = Math.max(0, spec.maxSteps - used.steps);
  if (spec.maxDurationMs !== undefined) {
    out.durationMs = Math.max(0, spec.maxDurationMs - used.durationMs);
  }
  return out;
}

function addUsageInPlace(target: TokenUsage, add: TokenUsage): void {
  const sum = (a?: number, b?: number) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  target.promptTokens = sum(target.promptTokens, add.promptTokens);
  target.completionTokens = sum(target.completionTokens, add.completionTokens);
  target.totalTokens = sum(target.totalTokens, add.totalTokens);
  target.cachedPromptTokens = sum(target.cachedPromptTokens, add.cachedPromptTokens);
  target.reasoningTokens = sum(target.reasoningTokens, add.reasoningTokens);
}

/**
 * Strip non-serializable fields from a `BudgetSpec` so the snapshot
 * stays JSON-safe. Function-form `onExceed` collapses to `'throw'`; the
 * caller can re-supply the spec on resume to restore the resolver.
 */
function serializeBudgetSpec(spec: BudgetSpec): SerializableBudgetSpec {
  const out: SerializableBudgetSpec = {};
  if (spec.tenantId !== undefined) out.tenantId = spec.tenantId;
  if (spec.hard !== undefined) out.hard = spec.hard;
  if (spec.maxUsd !== undefined) out.maxUsd = spec.maxUsd;
  if (spec.maxTokens !== undefined) out.maxTokens = spec.maxTokens;
  if (spec.maxLlmCalls !== undefined) out.maxLlmCalls = spec.maxLlmCalls;
  if (spec.maxSteps !== undefined) out.maxSteps = spec.maxSteps;
  if (spec.maxDurationMs !== undefined) out.maxDurationMs = spec.maxDurationMs;
  if (spec.warnAt !== undefined) out.warnAt = { ...spec.warnAt };
  if (spec.onExceed === 'throw' || spec.onExceed === 'truncate') {
    out.onExceed = spec.onExceed;
  } else if (typeof spec.onExceed === 'function') {
    // Function form cannot survive serialization; fall back to throw and
    // document that the caller should re-supply the spec on resume.
    out.onExceed = 'throw';
  }
  return out;
}

function deserializeBudgetSpec(spec: SerializableBudgetSpec | undefined): BudgetSpec | undefined {
  if (!spec) return undefined;
  return spec as BudgetSpec; // shape is already a structural superset
}

function serializeError(err: unknown): { message: string; name?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { message: String(err) };
}
