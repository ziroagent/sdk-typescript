import { describe, expect, it } from 'vitest';
import { InvalidPromptError } from '../errors.js';
import { normalizePrompt } from './normalize-prompt.js';

describe('normalizePrompt', () => {
  it('normalizes a single prompt string into a user message', () => {
    const out = normalizePrompt({ prompt: 'Hi' });
    expect(out).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }]);
  });

  it('prepends the system message when provided', () => {
    const out = normalizePrompt({ system: 'You are helpful', prompt: 'Hi' });
    expect(out[0]).toEqual({
      role: 'system',
      content: [{ type: 'text', text: 'You are helpful' }],
    });
    expect(out[1]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Hi' }] });
  });

  it('passes through messages array', () => {
    const out = normalizePrompt({
      messages: [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]?.role).toBe('user');
    expect(out[1]?.role).toBe('assistant');
  });

  it('throws when neither prompt nor messages is provided', () => {
    expect(() => normalizePrompt({})).toThrow(InvalidPromptError);
  });

  it('throws when both prompt and messages are provided', () => {
    expect(() =>
      normalizePrompt({ prompt: 'a', messages: [{ role: 'user', content: 'b' }] }),
    ).toThrow(InvalidPromptError);
  });

  it('handles multimodal user content', () => {
    const out = normalizePrompt({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'caption this' },
            { type: 'image', image: 'https://example.com/cat.png' },
          ],
        },
      ],
    });
    expect(out[0]?.content).toHaveLength(2);
    expect(out[0]?.content[1]?.type).toBe('image');
  });

  it('normalizes audio and file parts with optional metadata', () => {
    const out = normalizePrompt({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'listen' },
            { type: 'audio', audio: 'https://example.com/a.wav', mimeType: 'audio/wav' },
            {
              type: 'file',
              file: 'https://example.com/b.pdf',
              mimeType: 'application/pdf',
              filename: 'b.pdf',
            },
          ],
        },
      ],
    });
    const parts = out[0]?.content;
    expect(parts?.[1]).toEqual({
      type: 'audio',
      audio: 'https://example.com/a.wav',
      mimeType: 'audio/wav',
    });
    expect(parts?.[2]).toEqual({
      type: 'file',
      file: 'https://example.com/b.pdf',
      mimeType: 'application/pdf',
      filename: 'b.pdf',
    });
  });

  it('normalizes reserved video parts', () => {
    const out = normalizePrompt({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe' },
            { type: 'video', video: 'https://example.com/c.mp4', mimeType: 'video/mp4' },
          ],
        },
      ],
    });
    expect(out[0]?.content[1]).toEqual({
      type: 'video',
      video: 'https://example.com/c.mp4',
      mimeType: 'video/mp4',
    });
  });
});
