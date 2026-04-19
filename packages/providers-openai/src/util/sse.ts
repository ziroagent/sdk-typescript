/**
 * Parse a Server-Sent Events stream into a sequence of `data:` payloads
 * (the bit between `data: ` and the blank line). Comment lines, retries, and
 * other SSE features we don't need are ignored.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.length > 0) {
          const event = extractEvent(buffer);
          if (event !== null) yield event;
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const sepIdx = findEventBoundary(buffer);
        if (sepIdx === -1) break;
        const block = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx).replace(/^(\r?\n){2}/, '');
        const event = extractEvent(block);
        if (event !== null) yield event;
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

function extractEvent(block: string): string | null {
  const lines = block.split(/\r?\n/);
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (data.length === 0) return null;
  return data.join('\n');
}
