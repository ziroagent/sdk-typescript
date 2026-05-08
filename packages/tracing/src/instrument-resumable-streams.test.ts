import { fireResumableStreamEvent, setResumableStreamObserver } from '@ziro-agent/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ATTR } from './attributes.js';
import { instrumentResumableStreams } from './instrument-resumable-streams.js';
import { type SpanLike, setTracer, type ZiroTracer } from './tracer.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  events: { name: string; attributes?: Record<string, unknown> }[];
  status?: { code: number; message?: string };
  ended: boolean;
}

function recordingTracer(): ZiroTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = [];
  const make = (name: string, initialAttrs?: Record<string, unknown>): SpanLike => {
    const rec: RecordedSpan = {
      name,
      attributes: { ...(initialAttrs ?? {}) },
      events: [],
      ended: false,
    };
    spans.push(rec);
    return {
      setAttribute(k, v) {
        rec.attributes[k] = v;
      },
      setAttributes(attrs) {
        Object.assign(rec.attributes, attrs);
      },
      setStatus(s) {
        rec.status = s;
      },
      recordException() {},
      addEvent(name, attributes) {
        rec.events.push({ name, ...(attributes ? { attributes } : {}) });
      },
      end() {
        rec.ended = true;
      },
    };
  };
  return {
    spans,
    startSpan(name, options) {
      return make(name, options?.attributes);
    },
    async withSpan(name, fn, options) {
      const span = make(name, options?.attributes);
      try {
        const out = await fn(span);
        span.setStatus({ code: 1 });
        return out;
      } finally {
        span.end();
      }
    },
  };
}

let unregister: () => void = () => {};

beforeEach(() => {
  unregister = () => {};
});

afterEach(() => {
  unregister();
  setTracer(null);
  setResumableStreamObserver(null);
});

describe('instrumentResumableStreams', () => {
  it('opens and closes ziro.resumable.replay for replay_start / replay_end', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentResumableStreams());

    fireResumableStreamEvent({
      phase: 'replay_start',
      resumeKey: 'rk-1',
      replayCount: 2,
    });
    fireResumableStreamEvent({
      phase: 'replay_end',
      resumeKey: 'rk-1',
      replayCount: 2,
    });

    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0];
    expect(span?.name).toBe('ziro.resumable.replay');
    expect(span?.attributes[ATTR.ResumableResumeKey]).toBe('rk-1');
    expect(span?.attributes[ATTR.ResumableReplayCount]).toBe(2);
    expect(span?.ended).toBe(true);
    expect(span?.status?.code).toBe(1);
  });

  it('records continue phases as span events', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentResumableStreams());

    fireResumableStreamEvent({ phase: 'replay_start', resumeKey: 'k', replayCount: 0 });
    fireResumableStreamEvent({ phase: 'continue_lock_acquired', resumeKey: 'k' });
    fireResumableStreamEvent({ phase: 'continue_upstream_start', resumeKey: 'k' });
    fireResumableStreamEvent({ phase: 'continue_lock_released', resumeKey: 'k' });
    fireResumableStreamEvent({ phase: 'continue_upstream_end', resumeKey: 'k' });
    fireResumableStreamEvent({ phase: 'replay_end', resumeKey: 'k', replayCount: 0 });

    const span = tracer.spans[0];
    expect(span?.events.map((e) => e.name)).toEqual([
      'ziro.resumable.continue_lock_acquired',
      'ziro.resumable.continue_upstream_start',
      'ziro.resumable.continue_lock_released',
      'ziro.resumable.continue_upstream_end',
    ]);
    expect(span?.status?.code).toBe(1);
  });

  it('ends replay span with ERROR when upstream started but not ended', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentResumableStreams());

    fireResumableStreamEvent({ phase: 'replay_start', resumeKey: 'k', replayCount: 1 });
    fireResumableStreamEvent({ phase: 'continue_upstream_start', resumeKey: 'k' });
    fireResumableStreamEvent({ phase: 'replay_end', resumeKey: 'k', replayCount: 1 });

    expect(tracer.spans[0]?.status?.code).toBe(2);
  });

  it('emits a point-in-time span for replay_stale_expected_index', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentResumableStreams());

    fireResumableStreamEvent({
      phase: 'replay_stale_expected_index',
      resumeKey: 'stale-key',
      expectedNextIndex: 3,
      serverNextIndex: 5,
    });

    expect(tracer.spans).toHaveLength(1);
    const span = tracer.spans[0];
    expect(span?.name).toBe('ziro.resumable.stale_expected_index');
    expect(span?.attributes[ATTR.ResumableExpectedNextIndex]).toBe(3);
    expect(span?.attributes[ATTR.ResumableServerNextIndex]).toBe(5);
    expect(span?.status?.code).toBe(2);
    expect(span?.ended).toBe(true);
  });

  it('chains to a previously installed observer', () => {
    const seen: string[] = [];
    setResumableStreamObserver({
      onEvent(e) {
        seen.push(e.phase);
      },
    });

    const tracer = recordingTracer();
    setTracer(tracer);
    ({ unregister } = instrumentResumableStreams());

    fireResumableStreamEvent({ phase: 'replay_start', resumeKey: 'c', replayCount: 0 });
    fireResumableStreamEvent({ phase: 'replay_end', resumeKey: 'c', replayCount: 0 });

    expect(seen).toEqual(['replay_start', 'replay_end']);
    expect(tracer.spans).toHaveLength(1);
  });

  it('unregister restores the previous observer and ends orphan spans', () => {
    const tracer = recordingTracer();
    setTracer(tracer);
    const { unregister: un } = instrumentResumableStreams();
    fireResumableStreamEvent({ phase: 'replay_start', resumeKey: 'orphan', replayCount: 0 });
    un();

    const span = tracer.spans[0];
    expect(span?.ended).toBe(true);
    expect(span?.status?.code).toBe(2);

    let after = false;
    setResumableStreamObserver({
      onEvent() {
        after = true;
      },
    });
    fireResumableStreamEvent({ phase: 'replay_start', resumeKey: 'x', replayCount: 0 });
    expect(after).toBe(true);
  });
});
