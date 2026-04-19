import type { CostEstimate } from '../budget/types.js';
import type { ContentPart, ToolCallPart } from './content.js';
import type { FinishReason } from './finish-reason.js';
import type { NormalizedMessage } from './messages.js';
import type { TokenUsage } from './usage.js';

/**
 * Provider-agnostic JSON schema (a subset compatible with both OpenAI and
 * Anthropic tool definitions). Providers translate this into their native
 * format. Re-declared here to avoid pulling in `zod` as a hard runtime dep.
 */
export type JSONSchema = Record<string, unknown>;

export interface ToolDefinitionForModel {
  name: string;
  description?: string;
  parameters: JSONSchema;
}

export interface ModelCallOptions {
  messages: NormalizedMessage[];
  tools?: ToolDefinitionForModel[];
  toolChoice?: 'auto' | 'required' | 'none' | { toolName: string };
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  seed?: number;
  /** Provider-specific options, untyped at this layer. */
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  /** Per-request HTTP headers (e.g. tracing). */
  headers?: Record<string, string>;
}

export interface ModelGenerateResult {
  /** Concatenated assistant text (empty string if the model only made tool calls). */
  text: string;
  /** Structured content parts (text + tool calls). */
  content: ContentPart[];
  toolCalls: ToolCallPart[];
  finishReason: FinishReason;
  usage: TokenUsage;
  /** Raw provider response for debugging — not part of the stable API. */
  rawResponse?: unknown;
}

/**
 * A streamed event from a model. Designed to be lossless: every "delta" carries
 * enough information to reconstruct the final result.
 */
export type ModelStreamPart =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-call-delta'; toolCallId: string; toolName: string; argsDelta: string }
  | {
      type: 'finish';
      finishReason: FinishReason;
      usage: TokenUsage;
    }
  | { type: 'error'; error: unknown };

/**
 * The contract every provider implements. Keep this small and stable —
 * features that are nice-to-have go on the result type, not the interface.
 */
export interface LanguageModel {
  /** Stable identifier of the underlying model, e.g. `gpt-4o-mini`. */
  readonly modelId: string;
  /** Provider id, e.g. `openai`, `anthropic`. */
  readonly provider: string;

  generate(options: ModelCallOptions): Promise<ModelGenerateResult>;

  stream(options: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>>;

  /**
   * Optional pre-flight cost estimate used by Budget Guard. When implemented,
   * `generateText({ budget })` consults this before issuing `generate` so the
   * SDK can throw `BudgetExceededError` BEFORE any network call is made.
   *
   * Implementations should return conservative bounds — assume the model
   * fills `options.maxTokens` (or its default cap) for `maxUsd`/`maxTokens`.
   * Set `pricingAvailable: false` when the SDK has no pricing row for the
   * model id; the caller will then fall back to post-call enforcement only.
   */
  estimateCost?(options: ModelCallOptions): Promise<CostEstimate> | CostEstimate;
}
