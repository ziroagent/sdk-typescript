import { describe, expect, it } from 'vitest';
import { parseSSEWithEvent } from './sse.js';

function bodyOf(text: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(text));
      c.close();
    },
  });
}

describe('parseSSEWithEvent', () => {
  it('parses a single event', async () => {
    const events: unknown[] = [];
    for await (const evt of parseSSEWithEvent(bodyOf('event: foo\ndata: {"a":1}\n\n'))) {
      events.push(evt);
    }
    expect(events).toEqual([{ event: 'foo', data: '{"a":1}' }]);
  });

  it('parses multiple events', async () => {
    const text =
      'event: a\ndata: {"x":1}\n\n' + 'event: b\ndata: {"y":2}\n\n' + 'event: c\ndata: {"z":3}\n\n';
    const events: unknown[] = [];
    for await (const evt of parseSSEWithEvent(bodyOf(text))) events.push(evt);
    expect(events).toHaveLength(3);
  });
});
