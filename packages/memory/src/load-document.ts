import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
    default:
      return 'application/octet-stream';
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
 * `.csv`, `.json` (as UTF-8 text), `.pdf` when `pdf-parse` is installed, and
 * `.docx` when `mammoth` is installed.
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

  if (mime === 'application/pdf') {
    base.text = await parsePdfBuffer(buf);
    return base;
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    base.text = await parseDocxBuffer(buf);
    return base;
  }

  base.text = buf.toString('utf8');
  return base;
}
