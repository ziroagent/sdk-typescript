import { InvalidArgumentError } from '../errors.js';

/** Inline base64 payload (no `data:` prefix) plus optional IANA mime. */
export interface InlineMediaBytes {
  base64: string;
  mimeType?: string;
}

/** Remote resource the provider will fetch (`https`, `http`, or `file:` URL). */
export interface RemoteMediaUrl {
  url: string;
}

export type ResolvedMedia = InlineMediaBytes | RemoteMediaUrl;

function uint8ToBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.byteLength; i++) s += String.fromCharCode(arr[i] as number);
  return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

function utf8ToBase64(text: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64');
  return btoa(unescape(encodeURIComponent(text)));
}

/**
 * Normalises `UserMessage` media fields to either inline base64 or a fetchable URL.
 * Does not perform network I/O — URLs are passed through for providers that support them.
 */
export function resolveMediaInput(input: string | URL | Uint8Array): ResolvedMedia {
  if (input instanceof Uint8Array) {
    return { base64: uint8ToBase64(input) };
  }
  const s = input instanceof URL ? input.toString() : input;
  if (s.startsWith('data:')) {
    const comma = s.indexOf(',');
    if (comma < 0) {
      throw new InvalidArgumentError({
        argument: 'dataUrl',
        message: 'Malformed data URL (missing comma).',
      });
    }
    const header = s.slice(5, comma);
    const isBase64 = /;base64$/i.test(header) || header.endsWith(';base64');
    const mimeMatch = /^([^;]+)/.exec(header);
    const mimeType = mimeMatch?.[1]?.replace(/;base64$/i, '') || undefined;
    const payload = s.slice(comma + 1);
    if (isBase64) {
      return { base64: payload, mimeType: mimeType || undefined };
    }
    try {
      return {
        base64: utf8ToBase64(decodeURIComponent(payload)),
        mimeType: mimeType || 'text/plain',
      };
    } catch {
      throw new InvalidArgumentError({
        argument: 'dataUrl',
        message: 'Non-base64 data URL must be UTF-8 percent-encoded text.',
      });
    }
  }
  if (/^https?:\/\//i.test(s) || s.startsWith('file:')) {
    return { url: s };
  }
  throw new InvalidArgumentError({
    argument: 'audio|file',
    message: 'Expected Uint8Array, data URL, http(s) URL, or file: URL.',
  });
}
