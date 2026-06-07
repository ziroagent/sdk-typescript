/**
 * Base URL for the per-error documentation pages. A `ZiroError`'s `docsUrl`
 * defaults to `${ERROR_DOCS_BASE}/${code}` so every error links to its own
 * troubleshooting page (RC milestone R1).
 */
export const ERROR_DOCS_BASE = 'https://ziroagent.com/docs/errors';

/**
 * Base class for every ZiroAgent SDK error. Always check with `isZiroError()` —
 * never `instanceof` across realms (e.g. workers, vm contexts).
 *
 * Every subclass carries a stable, machine-readable `code` and a `docsUrl`
 * (auto-derived from `code` unless overridden) so operators can jump straight
 * to the relevant docs from a log line or trace.
 */
export class ZiroError extends Error {
  override readonly name: string = 'ZiroError';
  readonly code: string;
  /** Stable docs link for this error class; defaults to `${ERROR_DOCS_BASE}/${code}`. */
  readonly docsUrl: string;
  override readonly cause?: unknown;

  constructor(message: string, options: { code: string; docsUrl?: string; cause?: unknown }) {
    super(message);
    this.code = options.code;
    this.docsUrl = options.docsUrl ?? `${ERROR_DOCS_BASE}/${options.code}`;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Single source of truth for the realm-safe error brand. Re-exported so other
 * modules (e.g. `budget/errors.ts`) brand their errors with the *same* literal
 * instead of duplicating it — a desynced copy would silently break
 * `isZiroError()` across modules.
 */
export const ZIRO_ERROR_BRAND = '__ziro_error__';

export function isZiroError(value: unknown): value is ZiroError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [ZIRO_ERROR_BRAND]?: boolean })[ZIRO_ERROR_BRAND] === true
  );
}

/**
 * Stamp the realm-safe brand onto a Ziro error. Exported for sibling error
 * modules so the brand literal lives in exactly one place.
 */
export function brandZiroError<T extends object>(err: T): T {
  Object.defineProperty(err, ZIRO_ERROR_BRAND, { value: true, enumerable: false });
  return err;
}

const brand = brandZiroError;

export class APICallError extends ZiroError {
  override readonly name = 'APICallError';
  readonly statusCode?: number;
  readonly url?: string;
  readonly responseBody?: string;
  readonly isRetryable: boolean;
  /**
   * Server-requested backoff in milliseconds, parsed from a `Retry-After`
   * header (or equivalent) by the provider. When present, retry middleware
   * SHOULD honour this instead of its own exponential backoff. `undefined`
   * when the server did not specify one.
   */
  readonly retryAfterMs?: number;

  constructor(options: {
    message: string;
    url?: string;
    statusCode?: number;
    responseBody?: string;
    isRetryable?: boolean;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(options.message, { code: 'api_call_error', cause: options.cause });
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.url !== undefined) this.url = options.url;
    if (options.responseBody !== undefined) this.responseBody = options.responseBody;
    if (options.retryAfterMs !== undefined && Number.isFinite(options.retryAfterMs)) {
      this.retryAfterMs = Math.max(0, options.retryAfterMs);
    }
    this.isRetryable = options.isRetryable ?? defaultIsRetryable(options.statusCode);
    brand(this);
  }
}

/**
 * Realm-safe check for {@link APICallError}. Prefer this over `instanceof`
 * when an error may have crossed a realm/bundle boundary (workers, vm,
 * duplicate package copies).
 */
export function isAPICallError(value: unknown): value is APICallError {
  return isZiroError(value) && (value as ZiroError).code === 'api_call_error';
}

/**
 * Realm-safe check for {@link TimeoutError}. See {@link isAPICallError}.
 */
export function isTimeoutError(value: unknown): value is TimeoutError {
  return isZiroError(value) && (value as ZiroError).code === 'timeout';
}

/**
 * Parse a `Retry-After` header value into milliseconds. Supports both the
 * delta-seconds form (`"120"`) and the HTTP-date form
 * (`"Wed, 21 Oct 2026 07:28:00 GMT"`). Returns `undefined` when absent or
 * unparseable so callers fall back to their own backoff.
 */
export function parseRetryAfterMs(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (trimmed === '') return undefined;
  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000);
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

function defaultIsRetryable(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status === 408 || status === 409 || status === 429) return true;
  return status >= 500 && status < 600;
}

export class InvalidPromptError extends ZiroError {
  override readonly name = 'InvalidPromptError';
  constructor(message: string, cause?: unknown) {
    super(message, { code: 'invalid_prompt', cause });
    brand(this);
  }
}

export class InvalidArgumentError extends ZiroError {
  override readonly name = 'InvalidArgumentError';
  readonly argument: string;
  constructor(options: { argument: string; message: string; cause?: unknown }) {
    super(options.message, { code: 'invalid_argument', cause: options.cause });
    this.argument = options.argument;
    brand(this);
  }
}

export class NoTextGeneratedError extends ZiroError {
  override readonly name = 'NoTextGeneratedError';
  constructor() {
    super('No text was generated by the model.', { code: 'no_text_generated' });
    brand(this);
  }
}

export class JSONParseError extends ZiroError {
  override readonly name = 'JSONParseError';
  readonly text: string;
  constructor(text: string, cause?: unknown) {
    super('Failed to parse JSON response from model.', { code: 'json_parse_error', cause });
    this.text = text;
    brand(this);
  }
}

/** Thrown by {@link generateObject} when JSON is invalid or fails Zod validation after optional repair. */
export class ObjectValidationError extends ZiroError {
  override readonly name = 'ObjectValidationError';
  readonly text: string;
  readonly repairAttempted: boolean;
  readonly zodIssues?: readonly { path: (string | number)[]; message: string; code?: string }[];

  constructor(options: {
    message: string;
    text: string;
    repairAttempted: boolean;
    zodIssues?: readonly { path: (string | number)[]; message: string; code?: string }[];
    cause?: unknown;
  }) {
    super(options.message, { code: 'object_validation_error', cause: options.cause });
    this.text = options.text;
    this.repairAttempted = options.repairAttempted;
    if (options.zodIssues !== undefined) this.zodIssues = options.zodIssues;
    brand(this);
  }
}

export class TimeoutError extends ZiroError {
  override readonly name = 'TimeoutError';
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms.`, { code: 'timeout' });
    this.timeoutMs = timeoutMs;
    brand(this);
  }
}

/** Thrown when a {@link ContentPart} type is not implemented for the chosen provider yet (e.g. audio/file before v0.7 provider parity). */
export class UnsupportedPartError extends ZiroError {
  override readonly name = 'UnsupportedPartError';
  readonly partType: string;
  readonly provider: string;

  constructor(options: { partType: string; provider: string; message?: string }) {
    super(
      options.message ??
        `The "${options.partType}" content part is not yet supported by the ${options.provider} provider.`,
      { code: 'unsupported_part' },
    );
    this.partType = options.partType;
    this.provider = options.provider;
    brand(this);
  }
}
