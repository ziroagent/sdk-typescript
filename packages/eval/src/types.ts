/**
 * Eval primitives — see RFC 0003.
 *
 * This file defines the data shapes only. Runner / grader / reporter logic
 * lives in their own modules and consumes these types. Every shape here is
 * JSON-serialisable by construction (no functions, no class instances) so an
 * `EvalRun` can be persisted, posted to a PR, or streamed to a hosted store
 * without further transformation.
 */

import type { AgentSnapshot } from '@ziro-agent/agent';
import type { BudgetSpec, BudgetUsage } from '@ziro-agent/core';

/** A single input → expected pair. `expected` is opaque to the runner;
 *  graders interpret it however they like (string, JSON, schema, …). */
export interface EvalCase<TInput = unknown, TExpected = unknown> {
  /** Stable id; defaults to dataset index if omitted. */
  id?: string;
  /** Human-readable name shown in reports. Defaults to id. */
  name?: string;
  /** What the agent / function under test receives. */
  input: TInput;
  /** Optional ground truth. Many graders need this; some
   *  (`costBudget`, `latency`, `noToolErrors`) don't. */
  expected?: TExpected;
  /** Free-form metadata propagated to GraderContext.case.metadata. */
  metadata?: Record<string, unknown>;
  /** Per-case timeout in ms. Overrides EvalSpec.timeoutMs. */
  timeoutMs?: number;
  /** Per-case budget. Intersected with EvalSpec.budget if both present. */
  budget?: BudgetSpec;
}

export interface RunContext {
  caseId: string;
  caseName: string;
  abortSignal: AbortSignal;
  metadata: Record<string, unknown>;
}

export interface GraderContext<TInput = unknown, TExpected = unknown> {
  case: EvalCase<TInput, TExpected>;
  /** Wall-clock duration of the `run()` invocation. */
  durationMs: number;
  budgetUsage?: BudgetUsage;
  error?: unknown;
  /** Populated when the run threw `AgentSuspendedError` from RFC 0002. */
  agentSnapshot?: AgentSnapshot;
}

export interface GraderResult {
  /** 0..1 inclusive. `1` is a perfect pass; `0` a complete fail. */
  score: number;
  /** Convenience flag; defaults to `score >= 0.5` if a grader doesn't set it. */
  passed: boolean;
  /** Human-readable explanation surfaced in reports. */
  reason?: string;
  /** Free-form telemetry (e.g. judge model id, raw judge response). */
  details?: Record<string, unknown>;
}

export interface Grader<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  name: string;
  /** When `false`, the grader's score is excluded from the weighted mean.
   *  Useful for diagnostics like `latency` that you want to *report* but
   *  not gate on. Defaults to true. */
  contributes?: boolean;
  /** Default 1. Used by `meanScore` aggregation. */
  weight?: number;
  grade(
    input: TInput,
    output: TOutput,
    ctx: GraderContext<TInput, TExpected>,
  ): Promise<GraderResult> | GraderResult;
}

export type EvalGate =
  | { kind: 'meanScore'; min: number }
  | { kind: 'passRate'; min: number }
  | { kind: 'every'; grader: string; min: number }
  | {
      kind: 'custom';
      check: (run: EvalRun) => { passed: boolean; reason?: string };
    };

export interface EvalSpec<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  name: string;
  description?: string;
  dataset: ReadonlyArray<EvalCase<TInput, TExpected>>;
  /** The thing under test. Receives the case input plus a per-case context
   *  (case id, abortSignal, current budget scope). Returns whatever you
   *  want to grade. */
  run(input: TInput, ctx: RunContext): Promise<TOutput> | TOutput;
  /** Ordered list. All run; each grader's score contributes to the case's
   *  weighted mean. A single grader returning `passed: false` does NOT
   *  short-circuit — we want the full picture. */
  graders: ReadonlyArray<Grader<TInput, TOutput, TExpected>>;
  /** Default budget applied to every case (intersected with case.budget). */
  budget?: BudgetSpec;
  /** Default per-case timeout. */
  timeoutMs?: number;
  /** Pass/fail aggregation rule. Defaults to `{ kind: 'meanScore', min: 0.95 }`. */
  gate?: EvalGate;
}

export interface RunEvalOptions {
  /** Worker-pool size; default 4. */
  concurrency?: number;
  abortSignal?: AbortSignal;
  /** Called after each case finishes. Useful for streaming progress to a
   *  CLI spinner. Errors thrown here are swallowed. */
  onCaseFinish?: (result: EvalCaseResult) => void;
  /** Override the spec's gate for this run only (e.g. CLI `--gate 0.9`). */
  gate?: EvalGate;
}

export interface SerializableErrorInfo {
  name: string;
  message: string;
}

export interface CaseRunError extends SerializableErrorInfo {
  /** How the run terminated. */
  kind: 'thrown' | 'timeout' | 'suspended';
}

export interface CaseGraderEntry {
  grader: string;
  weight: number;
  contributes: boolean;
  result: GraderResult;
  durationMs: number;
  error?: SerializableErrorInfo;
}

export interface EvalCaseResult<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  case: EvalCase<TInput, TExpected>;
  /** Undefined when `error` is set. */
  output?: TOutput;
  durationMs: number;
  budgetUsage?: BudgetUsage;
  scopeId?: string;
  error?: CaseRunError;
  /** Captured when run threw AgentSuspendedError from RFC 0002. */
  agentSnapshot?: AgentSnapshot;
  graders: CaseGraderEntry[];
  /** Weighted mean of contributing grader scores; 0 if all errored. */
  meanScore: number;
  /** True iff every contributing grader.passed && no run-level error. */
  passed: boolean;
}

export interface EvalRunSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
  meanScore: number;
  totalCostUsd?: number;
  totalTokens?: number;
}

export interface EvalRun<TInput = unknown, TOutput = unknown, TExpected = unknown> {
  spec: { name: string; description?: string; gate: EvalGate };
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  cases: ReadonlyArray<EvalCaseResult<TInput, TOutput, TExpected>>;
  summary: EvalRunSummary;
  gate: { passed: boolean; reason: string };
}
