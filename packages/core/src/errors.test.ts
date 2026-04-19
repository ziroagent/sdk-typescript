import { describe, expect, it } from 'vitest';
import {
  APICallError,
  InvalidArgumentError,
  InvalidPromptError,
  isZiroError,
  JSONParseError,
  NoTextGeneratedError,
  TimeoutError,
  ZiroError,
} from './errors.js';

describe('error hierarchy', () => {
  it('all errors extend ZiroError and pass isZiroError', () => {
    const errs = [
      new APICallError({ message: 'fail', statusCode: 500 }),
      new InvalidPromptError('bad'),
      new InvalidArgumentError({ argument: 'x', message: 'bad' }),
      new NoTextGeneratedError(),
      new JSONParseError('not-json'),
      new TimeoutError(1000),
    ];
    for (const e of errs) {
      expect(e).toBeInstanceOf(ZiroError);
      expect(e).toBeInstanceOf(Error);
      expect(isZiroError(e)).toBe(true);
    }
  });

  it('isZiroError returns false for plain errors', () => {
    expect(isZiroError(new Error('x'))).toBe(false);
    expect(isZiroError({ message: 'x' })).toBe(false);
    expect(isZiroError(null)).toBe(false);
  });

  it('APICallError marks 5xx and 429 as retryable, 4xx as not', () => {
    expect(new APICallError({ message: 'x', statusCode: 500 }).isRetryable).toBe(true);
    expect(new APICallError({ message: 'x', statusCode: 429 }).isRetryable).toBe(true);
    expect(new APICallError({ message: 'x', statusCode: 408 }).isRetryable).toBe(true);
    expect(new APICallError({ message: 'x', statusCode: 400 }).isRetryable).toBe(false);
    expect(new APICallError({ message: 'x', statusCode: 401 }).isRetryable).toBe(false);
  });

  it('exposes a stable code on every error', () => {
    expect(new InvalidPromptError('x').code).toBe('invalid_prompt');
    expect(new TimeoutError(1).code).toBe('timeout');
  });
});
