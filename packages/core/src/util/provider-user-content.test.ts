import { describe, expect, it } from 'vitest';
import { UnsupportedPartError } from '../errors.js';
import { assertProviderMapsUserMultimodalParts } from './provider-user-content.js';

describe('assertProviderMapsUserMultimodalParts', () => {
  it('allows text and image', () => {
    expect(() =>
      assertProviderMapsUserMultimodalParts(
        [
          { type: 'text', text: 'hi' },
          { type: 'image', image: 'https://x/y.png' },
        ],
        'openai',
      ),
    ).not.toThrow();
  });

  it('throws UnsupportedPartError for audio', () => {
    expect(() =>
      assertProviderMapsUserMultimodalParts(
        [{ type: 'audio', audio: 'data:audio/wav;base64,AAA' }],
        'openai',
      ),
    ).toThrow(UnsupportedPartError);
  });

  it('throws UnsupportedPartError for file', () => {
    expect(() =>
      assertProviderMapsUserMultimodalParts(
        [{ type: 'file', file: 'https://cdn.example.com/doc.pdf', mimeType: 'application/pdf' }],
        'anthropic',
      ),
    ).toThrow(UnsupportedPartError);
  });
});
