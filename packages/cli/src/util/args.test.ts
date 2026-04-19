import { describe, expect, it } from 'vitest';
import { parseArgs } from './args.js';

describe('parseArgs', () => {
  it('parses positional args', () => {
    expect(parseArgs(['a', 'b'])).toEqual({ _: ['a', 'b'], flags: {} });
  });

  it('parses --flag=value', () => {
    expect(parseArgs(['--name=foo'])).toEqual({ _: [], flags: { name: 'foo' } });
  });

  it('parses --flag value', () => {
    expect(parseArgs(['--name', 'foo'])).toEqual({ _: [], flags: { name: 'foo' } });
  });

  it('treats trailing --flag as boolean', () => {
    expect(parseArgs(['--force'])).toEqual({ _: [], flags: { force: true } });
  });

  it('treats short flags as boolean', () => {
    expect(parseArgs(['-x'])).toEqual({ _: [], flags: { x: true } });
  });

  it('mixes positional and flags', () => {
    expect(parseArgs(['init', 'app', '--template=basic', '--force'])).toEqual({
      _: ['init', 'app'],
      flags: { template: 'basic', force: true },
    });
  });
});
