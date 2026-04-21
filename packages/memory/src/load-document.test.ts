import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDocument } from './load-document.js';

describe('loadDocument', () => {
  it('loads utf-8 markdown from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-mem-'));
    const p = join(dir, 'note.md');
    await writeFile(p, '# Hello\n', 'utf8');
    const doc = await loadDocument(p);
    expect(doc.text).toContain('Hello');
    expect(doc.metadata?.mimeType).toBe('text/markdown');
  });
});
