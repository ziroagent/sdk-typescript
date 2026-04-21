import { UnsupportedPartError } from '../errors.js';
import type { ContentPart } from '../types/content.js';

/**
 * **Ollama** (`/api/chat`): only `images[]` is supported for multimodal input.
 * Call this before serialising a `user` / `system` message so `audio` / `file`
 * parts fail fast with {@link UnsupportedPartError} instead of a daemon 400.
 */
export function assertProviderMapsUserMultimodalParts(
  parts: readonly ContentPart[],
  provider: string,
): void {
  for (const p of parts) {
    if (p.type === 'audio' || p.type === 'file') {
      throw new UnsupportedPartError({ partType: p.type, provider });
    }
  }
}
