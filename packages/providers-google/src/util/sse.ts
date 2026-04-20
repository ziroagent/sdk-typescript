/**
 * Gemini streams SSE chunks where each `data:` line is a JSON-encoded
 * `GenerateContentResponse`. Unlike Anthropic, Gemini does not use
 * `event:` framing — each block is one JSON delta. We yield raw `data`
 * strings; the model layer JSON-parses them.
 *
 * Vendored locally (instead of importing from the Anthropic provider)
 * to keep these provider packages mutually independent.
 */
export interface SSEDataEvent {
  data: string;
}

export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<SSEDataEvent> {
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

function parseBlock(block: string): SSEDataEvent | null {
  const lines = block.split(/\r?\n/);
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0) return null;
  return { data: data.join('\n') };
}
