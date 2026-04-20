/**
 * Parse a `ReadableStream<Uint8Array>` of newline-delimited JSON into an
 * async iterator of parsed records. Tolerates `\r\n`, blank lines, and
 * partial chunks.
 *
 * Ollama's `/api/chat?stream=true` emits one JSON object per line —
 * unlike OpenAI / Anthropic which use SSE (`data: {...}\n\n`).
 */
export async function* parseNDJSON<T = unknown>(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '').trim();
        buffer = buffer.slice(nl + 1);
        if (line.length > 0) {
          yield JSON.parse(line) as T;
        }
        nl = buffer.indexOf('\n');
      }
    }
    const tail = buffer.trim();
    if (tail.length > 0) yield JSON.parse(tail) as T;
  } finally {
    reader.releaseLock();
  }
}
