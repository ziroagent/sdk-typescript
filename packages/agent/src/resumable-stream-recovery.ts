import {
  ContinueUpstreamMidToolCallError,
  type ModelStreamPart,
  tailBlocksContinueUpstream,
} from '@ziro-agent/core';

export { ContinueUpstreamMidToolCallError, tailBlocksContinueUpstream };

/**
 * Narrow `ContinueUpstreamMidToolCallError` after a failed
 * `streamText({ continueUpstream: true })` call (RFC 0018).
 */
export function isContinueUpstreamMidToolCallError(
  err: unknown,
): err is ContinueUpstreamMidToolCallError {
  return err instanceof ContinueUpstreamMidToolCallError;
}

/**
 * Operator-facing hint when {@link ContinueUpstreamMidToolCallError} is thrown:
 * do not retry bare continue-upstream; use the agent loop / checkpoint resume
 * ([RFC 0002](https://github.com/ziroagent/sdk-typescript/blob/main/rfcs/0002-human-in-the-loop.md)).
 */
export const MID_TOOL_CALL_CONTINUE_UPSTREAM_HINT =
  'Do not retry streamText({ continueUpstream: true }). Resume via agent.resume(...) / resumeFromCheckpoint(threadId), or execute pending tools and issue a new model call with tool results in messages (RFC 0018).';

/**
 * Same predicate as {@link tailBlocksContinueUpstream}, exposed on the agent
 * package so hosts can branch before calling continue-upstream.
 */
export function streamTailNeedsAgentRecovery(parts: readonly ModelStreamPart[]): boolean {
  return tailBlocksContinueUpstream(parts);
}
