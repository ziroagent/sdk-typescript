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
    default:
      return 'application/octet-stream';
  }
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
 * `.csv`, `.json` (as UTF-8 text), and `.pdf` when `pdf-parse` is installed.
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

  base.text = buf.toString('utf8');
  return base;
}
