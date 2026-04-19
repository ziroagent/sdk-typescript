/**
 * Anthropic streams SSE with explicit `event:` lines (e.g. `content_block_delta`).
 * We surface both the event name and the data payload — the model logic decides
 * how to interpret them.
 */
export interface SSEEvent {
  event?: string;
  data: string;
}

export async function* parseSSEWithEvent(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim().length > 0) {
          const evt = parseBlock(buffer);
          if (evt) yield evt;
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const idx = findEventBoundary(buffer);
        if (idx === -1) break;
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^(\r?\n){2}/, '');
        const evt = parseBlock(block);
        if (evt) yield evt;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function findEventBoundary(s: string): number {
  const i1 = s.indexOf('\n\n');
  const i2 = s.indexOf('\r\n\r\n');
  if (i1 === -1) return i2;
  if (i2 === -1) return i1;
  return Math.min(i1, i2);
}

function parseBlock(block: string): SSEEvent | null {
  const lines = block.split(/\r?\n/);
  let event: string | undefined;
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0 && !event) return null;
  return { ...(event !== undefined ? { event } : {}), data: data.join('\n') };
}
