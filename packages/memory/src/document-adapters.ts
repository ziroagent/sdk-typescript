/**
 * Optional pluggable parsers for {@link loadDocument} (RFC 0012 ingestion registry).
 * Keys are lowercase file extensions (`.md`) or MIME strings (`text/markdown`).
 */
export type DocumentParseContext = {
  path: string;
  ext: string;
  mime: string;
  filename: string;
};

export type DocumentParser = (buffer: Buffer, ctx: DocumentParseContext) => Promise<string>;

const registry = new Map<string, DocumentParser>();

function normKey(key: string): string {
  const k = key.trim().toLowerCase();
  return k.startsWith('.')
    ? k
    : k.startsWith('text/') || k.includes('/')
      ? k
      : `.${k.replace(/^\./, '')}`;
}

/**
 * Register a parser for an extension (e.g. `.md`) or MIME type. Later
 * registrations overwrite earlier ones for the same key.
 */
export function registerDocumentParser(key: string, parser: DocumentParser): void {
  registry.set(normKey(key), parser);
}

/** Remove all custom parsers (intended for tests). */
export function clearDocumentParserRegistry(): void {
  registry.clear();
}

/** @internal */
export function getRegisteredDocumentParser(key: string): DocumentParser | undefined {
  return registry.get(normKey(key));
}
