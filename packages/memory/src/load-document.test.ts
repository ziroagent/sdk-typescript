import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { clearDocumentParserRegistry, registerDocumentParser } from './document-adapters.js';
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

  it('loads a tiny png via OCR when tesseract.js is available', async () => {
    if (process.env.SKIP_TESSERACT === '1') return;
    const dir = await mkdtemp(join(tmpdir(), 'ziro-ocr-'));
    const png1x1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const p = join(dir, 'tiny.png');
    await writeFile(p, png1x1);
    const doc = await loadDocument(p);
    expect(doc.metadata?.mimeType).toBe('image/png');
    expect(typeof doc.text).toBe('string');
  }, 180_000);

  it('uses registerDocumentParser before built-in utf-8 path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-mem-'));
    const p = join(dir, 'note.ziro');
    await writeFile(p, 'IGNORED', 'utf8');
    registerDocumentParser('.ziro', async () => 'from-registry');
    try {
      const doc = await loadDocument(p);
      expect(doc.text).toBe('from-registry');
    } finally {
      clearDocumentParserRegistry();
    }
  });
});
