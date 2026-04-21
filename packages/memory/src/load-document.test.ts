import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadDocument } from './load-document.js';

const helloDocx = join(dirname(fileURLToPath(import.meta.url)), '../test/fixtures/hello.docx');

describe('loadDocument', () => {
  it('loads utf-8 markdown from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-mem-'));
    const p = join(dir, 'note.md');
    await writeFile(p, '# Hello\n', 'utf8');
    const doc = await loadDocument(p);
    expect(doc.text).toContain('Hello');
    expect(doc.metadata?.mimeType).toBe('text/markdown');
  });

  it('loads docx text when mammoth is installed', async () => {
    const doc = await loadDocument(helloDocx);
    expect(doc.text).toContain('Hello DOCX fixture');
    expect(doc.metadata?.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(doc.metadata?.format).toBe('docx');
  });
});
