export {
  BudgetExceededError,
  type BudgetExceededKind,
  isBudgetExceededError,
} from './budget/errors.js';
export { type BudgetObserver, setBudgetObserver } from './budget/observer.js';
export { applyResolution, resolveOnExceed } from './budget/resolver.js';
export {
  getCurrentBudget,
  getCurrentScope,
  intersectSpecs,
  type WithBudgetOptions,
  withBudget,
} from './budget/scope.js';
export type {
  BudgetContext,
  BudgetOnExceed,
  BudgetResolution,
  BudgetSpec,
  BudgetUsage,
  BudgetWarnAt,
  CostEstimate,
} from './budget/types.js';
export {
  APICallError,
  brandZiroError,
  ERROR_DOCS_BASE,
  InvalidArgumentError,
  InvalidPromptError,
  isAPICallError,
  isTimeoutError,
  isZiroError,
  JSONParseError,
  NoTextGeneratedError,
  ObjectValidationError,
  parseRetryAfterMs,
  TimeoutError,
  UnsupportedPartError,
  ZIRO_ERROR_BRAND,
  ZiroError,
} from './errors.js';
export {
  type GenerateObjectOptions,
  type GenerateObjectResult,
  generateObject,
} from './generate-object.js';
export {
  type BudgetScope,
  computeActualUsd,
  type GenerateTextOptions,
  type GenerateTextResult,
  generateText,
  resolveEstimate,
} from './generate-text.js';
export {
  type ApprovalObserver,
  fireAgentResumed,
  fireAgentSuspended,
  fireApprovalRequested,
  fireApprovalResolved,
  setApprovalObserver,
} from './hitl/observer.js';
export {
  type AutoApproverOptions,
  autoApprove,
  autoReject,
  autoSuspend,
  createAutoApprover,
} from './hitl/presets.js';
export type {
  ApprovalContext,
  ApprovalDecision,
  ApprovalRequest,
  Approver,
  CoreAgentSnapshotFields,
  PendingApproval,
  RequiresApproval,
  SerializableBudgetSpec,
} from './hitl/types.js';
export {
  createStubBrowserAdapter,
  type StubBrowserAdapterResult,
} from './sandbox/stub-browser-adapter.js';
export {
  createStubSandboxAdapter,
  type StubSandboxAdapterOptions,
} from './sandbox/stub-sandbox-adapter.js';
export type {
  BrowserAdapter,
  BrowserNavigateOptions,
  SandboxAdapter,
  SandboxExecuteOptions,
  SandboxExecuteResult,
  SandboxFileArtifact,
  SandboxLanguage,
} from './sandbox/types.js';
export { type StreamTextOptions, streamText } from './stream-text.js';
export { tailBlocksContinueUpstream } from './streaming/model-stream-tail.js';
export {
  fireResumableStreamEvent,
  type ResumableStreamEvent,
  type ResumableStreamObserver,
  setResumableStreamObserver,
} from './streaming/resumable-stream-observer.js';
export {
  ContinueUpstreamMidToolCallError,
  InMemoryResumableStreamEventStore,
  type InMemoryResumableStreamEventStoreOptions,
  isTerminalModelStreamPart,
  type ResumableStreamContinueLock,
  type ResumableStreamContinueLockStore,
  ResumableStreamError,
  type ResumableStreamEventStore,
  type ResumableStreamSessionMeta,
} from './streaming/resumable-stream-store.js';
export { buildStreamTextResult, type StreamTextResult } from './streaming/text-stream.js';
export type {
  AudioPart,
  ContentPart,
  FilePart,
  ImagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  VideoPart,
} from './types/content.js';
export type { FinishReason } from './types/finish-reason.js';
export type {
  AssistantMessage,
  ChatMessage,
  NormalizedMessage,
  Role,
  SystemMessage,
  ToolMessage,
  UserMessage,
} from './types/messages.js';
export type {
  LanguageModelMiddleware,
  LanguageModelMiddlewareContext,
  WrapGenerateContext,
  WrapStreamContext,
} from './types/middleware.js';
export type {
  JSONSchema,
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
  ToolDefinitionForModel,
} from './types/model.js';
export { addUsage, emptyUsage, type TokenUsage } from './types/usage.js';
export { estimateTokensFromMessages, estimateTokensFromString } from './util/estimate-tokens.js';
export { type FallbackChainOptions, withFallbackChain } from './util/fallback-model.js';
export type { InlineMediaBytes, RemoteMediaUrl, ResolvedMedia } from './util/multimodal-encode.js';
export { resolveMediaInput } from './util/multimodal-encode.js';
export { normalizePrompt, type PromptInput } from './util/normalize-prompt.js';
export {
  type ProviderFetchOptions,
  providerFetch,
  redactQueryKey,
} from './util/provider-fetch.js';
export { assertProviderMapsUserMultimodalParts } from './util/provider-user-content.js';
export { wrapModel } from './util/wrap-model.js';
