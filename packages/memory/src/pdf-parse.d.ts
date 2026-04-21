declare module 'pdf-parse' {
  import type { Buffer } from 'node:buffer';

  function pdfParse(data: Buffer | Uint8Array): Promise<{ text?: string }>;
  export default pdfParse;
}
