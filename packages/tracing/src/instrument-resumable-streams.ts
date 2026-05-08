import type { ResumableStreamEvent, ResumableStreamObserver } from '@ziro-agent/core';
import { setResumableStreamObserver } from '@ziro-agent/core';
import { ATTR, type AttrValue } from './attributes.js';
import { getTracer, type SpanLike } from './tracer.js';

type ReplaySession = {
  span: SpanLike;
  upstreamStarted: boolean;
  upstreamEnded: boolean;
};

/**
 * Bridge `@ziro-agent/core` resumable `streamText` observer hooks into
 * OpenTelemetry. Call once at process startup after `setTracer(...)` so the
 * active tracer is the OTel-backed one — see RFC 0017 phased delivery.
 *
 * Opens one span per `resumeKey` (`ziro.resumable.replay`) from
 * `replay_start` until `replay_end`, with lock / continue phases as span
 * events. A standalone `ziro.resumable.stale_expected_index` span is emitted
 * when `expectedNextIndex` mismatches the server log (no `replay_start` yet).
 *
 * If `continueUpstream` was started but the continuation path errors before
 * `continue_upstream_end`, `replay_end` still fires and the replay span ends
 * with status **ERROR** (paired start without a successful upstream end).
 *
 * Returns `unregister()` plus the previously-installed observer so callers
 * can chain or restore in tests.
 */
export function instrumentResumableStreams(): {
  unregister: () => void;
  previous: ResumableStreamObserver | null;
} {
  const sessions = new Map<string, ReplaySession>();

  let chainedPrevious: ResumableStreamObserver | null = null;
  const observer: ResumableStreamObserver = {
    onEvent(event: ResumableStreamEvent) {
      traceResumableEvent(sessions, event);
      try {
        void chainedPrevious?.onEvent?.(event);
      } catch {
        /* chained observer must not break stream execution */
      }
    },
  };

  chainedPrevious = setResumableStreamObserver(observer);

  return {
    previous: chainedPrevious,
    unregister: () => {
      setResumableStreamObserver(chainedPrevious);
      for (const sess of sessions.values()) {
        sess.span.setStatus({ code: 2, message: 'unregistered' });
        sess.span.end();
      }
      sessions.clear();
    },
  };
}

function replayStartAttrs(event: ResumableStreamEvent): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {
    [ATTR.ResumableResumeKey]: event.resumeKey,
  };
  if (event.replayCount !== undefined) {
    out[ATTR.ResumableReplayCount] = event.replayCount;
  }
  return out;
}

function traceResumableEvent(
  sessions: Map<string, ReplaySession>,
  event: ResumableStreamEvent,
): void {
  const tracer = getTracer();
  const key = event.resumeKey;

  switch (event.phase) {
    case 'replay_stale_expected_index': {
      const attrs: Record<string, AttrValue> = {
        [ATTR.ResumableResumeKey]: key,
      };
      if (event.expectedNextIndex !== undefined) {
        attrs[ATTR.ResumableExpectedNextIndex] = event.expectedNextIndex;
      }
      if (event.serverNextIndex !== undefined) {
        attrs[ATTR.ResumableServerNextIndex] = event.serverNextIndex;
      }
      const span = tracer.startSpan('ziro.resumable.stale_expected_index', {
        kind: 'internal',
        attributes: attrs,
      });
      span.setStatus({ code: 2, message: 'expectedNextIndex mismatch' });
      span.end();
      break;
    }
    case 'replay_start': {
      if (sessions.has(key)) {
        const stale = sessions.get(key);
        sessions.delete(key);
        stale?.span.setStatus({ code: 2, message: 'overlapping replay_start' });
        stale?.span.end();
      }
      const span = tracer.startSpan('ziro.resumable.replay', {
        kind: 'internal',
        attributes: replayStartAttrs(event),
      });
      sessions.set(key, { span, upstreamStarted: false, upstreamEnded: false });
      break;
    }
    case 'continue_lock_acquired':
      sessions.get(key)?.span.addEvent('ziro.resumable.continue_lock_acquired');
      break;
    case 'continue_lock_released':
      sessions.get(key)?.span.addEvent('ziro.resumable.continue_lock_released');
      break;
    case 'continue_upstream_skipped_completed': {
      const sess = sessions.get(key);
      sess?.span.addEvent('ziro.resumable.continue_upstream_skipped_completed', {
        ...(event.replayCount !== undefined
          ? { [ATTR.ResumableReplayCount]: event.replayCount }
          : {}),
      });
      break;
    }
    case 'continue_upstream_start': {
      const sess = sessions.get(key);
      if (sess) sess.upstreamStarted = true;
      sess?.span.addEvent('ziro.resumable.continue_upstream_start');
      break;
    }
    case 'continue_upstream_end': {
      const sess = sessions.get(key);
      if (sess) sess.upstreamEnded = true;
      sess?.span.addEvent('ziro.resumable.continue_upstream_end');
      break;
    }
    case 'replay_end': {
      const sess = sessions.get(key);
      if (!sess) break;
      sessions.delete(key);
      if (event.replayCount !== undefined) {
        sess.span.setAttribute(ATTR.ResumableReplayCount, event.replayCount);
      }
      const upstreamError = sess.upstreamStarted && !sess.upstreamEnded;
      sess.span.setStatus({ code: upstreamError ? 2 : 1 });
      sess.span.end();
      break;
    }
    default:
      break;
  }
}
