import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from '../errors.js';
import { resolveMediaInput } from './multimodal-encode.js';

describe('resolveMediaInput', () => {
  it('returns inline base64 for Uint8Array', () => {
    const r = resolveMediaInput(new TextEncoder().encode('hi')) as { base64: string };
    expect(r.base64).toBe(Buffer.from('hi', 'utf8').toString('base64'));
  });

  it('parses data URLs with base64 payload', () => {
    const r = resolveMediaInput('data:application/pdf;base64,QUJD') as {
      base64: string;
      mimeType?: string;
    };
    expect(r.base64).toBe('QUJD');
    expect(r.mimeType).toBe('application/pdf');
  });

  it('passes through https URLs', () => {
    const r = resolveMediaInput('https://example.com/x.pdf');
    expect(r).toEqual({ url: 'https://example.com/x.pdf' });
  });

  it('throws on arbitrary strings', () => {
    expect(() => resolveMediaInput('not-a-url')).toThrow(InvalidArgumentError);
  });
});
