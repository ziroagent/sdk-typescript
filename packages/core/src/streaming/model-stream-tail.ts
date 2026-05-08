import type { ModelStreamPart } from '../types/model.js';

/**
 * Returns true when the persisted {@link ModelStreamPart} log must not be used
 * with `streamText({ continueUpstream: true })` — the tail implies an open tool
 * boundary (RFC 0018). Replay-only consumers may still read the log.
 *
 * Trailing `{ type: 'error' }` parts are ignored so a terminal error after a
 * valid `finish` does not block analysis.
 */
export function tailBlocksContinueUpstream(parts: readonly ModelStreamPart[]): boolean {
  let i = parts.length - 1;
  while (i >= 0 && parts[i]?.type === 'error') {
    i--;
  }
  if (i < 0) {
    return false;
  }
  const last = parts[i];
  if (last === undefined) {
    return false;
  }
  if (last.type === 'tool-call' || last.type === 'tool-call-delta') {
    return true;
  }
  if (last.type === 'finish') {
    return last.finishReason === 'tool-calls';
  }
  return false;
}
