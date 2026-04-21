import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from './define-tool.js';

describe('defineTool trace metadata', () => {
  it('preserves capabilities, spanName, and traceAttributes on the tool object', () => {
    const t = defineTool({
      name: 'demo',
      input: z.object({ x: z.number() }),
      capabilities: ['network'],
      spanName: 'custom.span',
      traceAttributes: { 'app.op': 'read' },
      execute: ({ x }) => x,
    });
    expect(t.capabilities).toEqual(['network']);
    expect(t.spanName).toBe('custom.span');
    expect(t.traceAttributes).toEqual({ 'app.op': 'read' });
  });
});
