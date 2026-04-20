import type {
  ContentPart,
  LanguageModelMiddleware,
  ModelCallOptions,
  NormalizedMessage,
} from '@ziro-agent/core';

/**
 * Built-in entity types recognised by the heuristic adapter. External
 * adapters (Presidio, AWS Comprehend) may return additional types — they
 * pass through verbatim into `replacements`.
 */
export type PiiEntity = 'EMAIL' | 'PHONE_NUMBER' | 'SSN' | 'CREDIT_CARD' | 'IP_ADDRESS' | 'IBAN';

export interface RedactionResult {
  /** Text with each detected entity replaced by a placeholder token. */
  redacted: string;
  /**
   * Map of `placeholder -> original` so consumers (or `restorePII`) can
   * undo the redaction once the model response comes back. Empty when the
   * input contained no detected entities.
   */
  replacements: Record<string, string>;
}

export interface PiiAdapter {
  /**
   * Detect & replace PII in `text`. MUST be deterministic for the same
   * input — `cache()` placed AFTER `redactPII()` relies on this.
   */
  redact(args: {
    text: string;
    entities: readonly PiiEntity[];
  }): RedactionResult | Promise<RedactionResult>;
}

/**
 * Heuristic regex-based PII adapter. Zero deps. Suitable for non-critical
 * paths and for offline development. Production deployments should swap in
 * a model-based adapter (Presidio, etc.) via the `adapter` option.
 *
 * Conservative by design — we'd rather under-redact than mangle prompts
 * with false positives. False-negative risk: NEVER rely on this to satisfy
 * GDPR / HIPAA compliance.
 */
export function heuristicPiiAdapter(): PiiAdapter {
  // Patterns are intentionally permissive but anchored to avoid mid-word
  // matches. Order MATTERS: we redact in the same order as they appear here
  // and never re-scan the placeholders.
  const PATTERNS: Array<{ entity: PiiEntity; regex: RegExp }> = [
    {
      entity: 'EMAIL',
      regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    },
    {
      // Visa / MC / Amex / Discover-ish — 13-19 digits with optional grouping.
      entity: 'CREDIT_CARD',
      regex: /\b(?:\d[ -]?){13,19}\b/g,
    },
    {
      entity: 'IBAN',
      regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    },
    {
      entity: 'SSN',
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    },
    {
      // E.164 + common national formats. Min 7 digits to avoid years/ids.
      entity: 'PHONE_NUMBER',
      regex: /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-]?){2,4}\d{2,4}\b/g,
    },
    {
      entity: 'IP_ADDRESS',
      regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    },
  ];

  return {
    redact({ text, entities }) {
      let out = text;
      const replacements: Record<string, string> = {};
      const counters: Record<string, number> = {};
      for (const { entity, regex } of PATTERNS) {
        if (!entities.includes(entity)) continue;
        out = out.replace(regex, (match) => {
          counters[entity] = (counters[entity] ?? 0) + 1;
          const placeholder = `[${entity}_${counters[entity]}]`;
          replacements[placeholder] = match;
          return placeholder;
        });
      }
      return { redacted: out, replacements };
    },
  };
}

export interface RedactPiiOptions {
  /** Adapter performing the actual detection. Default: heuristic. */
  adapter?: PiiAdapter;
  /** Entity types to redact. Default: `['EMAIL', 'PHONE_NUMBER', 'SSN', 'CREDIT_CARD']`. */
  entities?: readonly PiiEntity[];
  /**
   * Replace tokens IN-PLACE in user / system messages. Tool messages are
   * skipped (they often carry already-structured data). Default: `true`.
   */
  redactUserMessages?: boolean;
  /**
   * When provided, called with the per-call replacement map AFTER the
   * model returns. Use this to log redaction events or to populate a
   * vault for `restorePII()` (not shipped — leave intentionally as a
   * user-land concern, see RFC 0005 unresolved questions).
   */
  onRedacted?: (args: {
    replacements: Record<string, string>;
    params: ModelCallOptions;
  }) => void | Promise<void>;
}

const DEFAULT_ENTITIES: readonly PiiEntity[] = ['EMAIL', 'PHONE_NUMBER', 'SSN', 'CREDIT_CARD'];

/**
 * `redactPII()` — replace common PII tokens in outbound messages BEFORE
 * they reach the model. Operates in `transformParams` so the redaction
 * is visible to every downstream middleware (cache keys, traces).
 *
 * The middleware never resurrects the original PII. If you need
 * restoration, capture the `onRedacted` map and rewrite the response in
 * application code — the SDK refuses to ship that primitive until the
 * threat model is settled (RFC 0005 unresolved).
 */
export function redactPII(options: RedactPiiOptions = {}): LanguageModelMiddleware {
  const adapter = options.adapter ?? heuristicPiiAdapter();
  const entities = options.entities ?? DEFAULT_ENTITIES;
  const redactUserMessages = options.redactUserMessages ?? true;
  const onRedacted = options.onRedacted;

  const redactPart = async (
    part: ContentPart,
    accReplacements: Record<string, string>,
  ): Promise<ContentPart> => {
    if (part.type !== 'text') return part;
    const result = await adapter.redact({ text: part.text, entities });
    Object.assign(accReplacements, result.replacements);
    return { ...part, text: result.redacted };
  };

  const redactMessage = async (
    msg: NormalizedMessage,
    accReplacements: Record<string, string>,
  ): Promise<NormalizedMessage> => {
    if (msg.role === 'tool') return msg;
    if (!redactUserMessages && (msg.role === 'user' || msg.role === 'system')) return msg;
    const newContent = await Promise.all(
      msg.content.map((part) => redactPart(part, accReplacements)),
    );
    return { ...msg, content: newContent };
  };

  return {
    middlewareId: 'ziro/redact-pii',
    async transformParams({ params }) {
      const replacements: Record<string, string> = {};
      const messages = await Promise.all(
        params.messages.map((m) => redactMessage(m, replacements)),
      );
      if (onRedacted && Object.keys(replacements).length > 0) {
        await onRedacted({ replacements, params });
      }
      return { ...params, messages };
    },
  };
}
