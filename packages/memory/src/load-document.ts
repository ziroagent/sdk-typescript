import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getRegisteredDocumentParser } from './document-adapters.js';
import type { Document, Metadata } from './types.js';
import { uuid } from './util/uuid.js';

export interface LoadedDocument extends Document {
  metadata?: Metadata & {
    sourceUri?: string;
    mimeType?: string;
    format?: string;
  };
}

function extToMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.md':
    case '.markdown':
      return 'text/markdown';
    case '.txt':
      return 'text/plain';
    case '.csv':
      return 'text/csv';
    case '.pdf':
      return 'application/pdf';
    case '.json':
      return 'application/json';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function isRasterImageMime(mime: string): boolean {
  return (
    mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/gif' || mime === 'image/webp'
  );
}

async function parseImageBufferWithOcr(buf: Buffer): Promise<string> {
  let tesseract: typeof import('tesseract.js');
  try {
    tesseract = await import('tesseract.js');
  } catch {
    throw new Error(
      'Image OCR requires the optional dependency `tesseract.js`. Install it in your project: `pnpm add tesseract.js` (or npm/yarn equivalent).',
    );
  }
  const worker = await tesseract.createWorker('eng', undefined, {
    logger: () => undefined,
  });
  try {
    const res = await worker.recognize(buf);
    return (res.data.text ?? '').trim();
  } finally {
    await worker.terminate();
  }
}

async function parseDocxBuffer(buf: Buffer): Promise<string> {
  let extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  try {
    const mod = await import('mammoth');
    extractRawText = mod.extractRawText as (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  } catch {
    throw new Error(
      'DOCX ingestion requires the optional dependency `mammoth`. Install it in your project: `pnpm add mammoth` (or npm/yarn equivalent).',
    );
  }
  const res = await extractRawText({ buffer: buf });
  return (res.value ?? '').trim();
}

async function parsePdfBuffer(buf: Buffer): Promise<string> {
  let pdfParse: (b: Buffer) => Promise<{ text?: string }>;
  try {
    const mod = await import('pdf-parse');
    pdfParse = mod.default as (b: Buffer) => Promise<{ text?: string }>;
  } catch {
    throw new Error(
      'PDF ingestion requires the optional dependency `pdf-parse`. Install it in your project: `pnpm add pdf-parse` (or npm/yarn equivalent).',
    );
  }
  const res = await pdfParse(buf);
  return (res.text ?? '').trim();
}

function resolveFsPath(uri: string | URL): string {
  if (uri instanceof URL) return fileURLToPath(uri);
  if (uri.startsWith('file:')) return fileURLToPath(new URL(uri));
  return uri;
}

/**
 * Load a local file into a {@link Document}. Supports `.txt`, `.md`,
 * `.csv`, `.json` (as UTF-8 text), `.pdf` when `pdf-parse` is installed,
 * `.docx` when `mammoth` is installed, and raster images (`.png`, `.jpg`,
 * `.gif`, `.webp`) via OCR when `tesseract.js` is installed.
 *
 * @param uri `file:` URL or filesystem path (absolute or cwd-relative).
 */
export async function loadDocument(uri: string | URL): Promise<LoadedDocument> {
  const path = resolveFsPath(uri);
  const buf = await readFile(path);
  const ext = extname(path);
  const mime = extToMime(ext);
  const base: LoadedDocument = {
    id: uuid(),
    text: '',
    metadata: {
      sourceUri: pathToFileURL(path).href,
      mimeType: mime,
      format: ext.slice(1).toLowerCase() || 'bin',
      filename: basename(path),
    },
  };

  const parseCtx = {
    path,
    ext,
    mime,
    filename: basename(path),
  };

  const customByExt = getRegisteredDocumentParser(ext);
  if (customByExt) {
    base.text = await customByExt(buf, parseCtx);
    return base;
  }
  const customByMime = getRegisteredDocumentParser(mime);
  if (customByMime) {
    base.text = await customByMime(buf, parseCtx);
    return base;
  }

  if (mime === 'application/pdf') {
    base.text = await parsePdfBuffer(buf);
    return base;
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    base.text = await parseDocxBuffer(buf);
    return base;
  }

  if (isRasterImageMime(mime)) {
    base.text = await parseImageBufferWithOcr(buf);
    return base;
  }

  base.text = buf.toString('utf8');
  return base;
}
