/**
 * Error raised by `blockPromptInjection()` when an adapter (or the built-in
 * heuristic) flags a message as a likely injection attack.
 *
 * Extends `Error` rather than `ZiroError` to keep this package zero-dep on
 * `ZiroError`'s branded class — middleware is meant to be droppable into
 * non-ZiroAgent stacks too. Callers can still discriminate via `error.code`
 * or `error.name`.
 */
export class PromptInjectionError extends Error {
  override readonly name = 'PromptInjectionError';
  readonly code = 'prompt_injection';
  /** Reason supplied by the adapter — e.g. matched rule id or model output. */
  readonly reason: string;
  /** Optional confidence score in [0, 1] when the adapter exposes one. */
  readonly score?: number;
  /** Index of the offending message within `params.messages`, when known. */
  readonly messageIndex?: number;

  constructor(options: {
    reason: string;
    score?: number;
    messageIndex?: number;
  }) {
    super(`Prompt injection blocked: ${options.reason}`);
    this.reason = options.reason;
    if (options.score !== undefined) this.score = options.score;
    if (options.messageIndex !== undefined) this.messageIndex = options.messageIndex;
    Object.setPrototypeOf(this, PromptInjectionError.prototype);
  }
}
