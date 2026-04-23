/**
 * Durable working-memory tier (RFC 0011) — Node filesystem backing.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { WorkingMemory, WorkingMemoryScope } from './working-memory.js';

function backingFilePath(baseDir: string, scope: WorkingMemoryScope, key: string): string {
  const h = createHash('sha256').update(`${scope}\0${key}`).digest('hex').slice(0, 32);
  return join(baseDir, `${scope}-${h}.working.md`);
}

/**
 * Persists working-memory markdown under `baseDir` (one file per `scope`+`key`).
 * Safe for arbitrary `key` strings (hashed into the filename).
 */
export class FileBackedWorkingMemory implements WorkingMemory {
  private readonly filePath: string;

  constructor(
    readonly scope: WorkingMemoryScope,
    readonly key: string,
    /** Directory to store `.working.md` files (created on first write). */
    baseDir: string,
  ) {
    this.filePath = backingFilePath(baseDir, scope, key);
  }

  async read(): Promise<string> {
    try {
      return await readFile(this.filePath, 'utf8');
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return '';
      throw e;
    }
  }

  async write(markdown: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, markdown, 'utf8');
  }

  async append(markdown: string): Promise<void> {
    let cur = await this.read();
    if (cur.length > 0 && !cur.endsWith('\n')) cur += '\n';
    cur += markdown;
    await this.write(cur);
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') return;
      throw e;
    }
  }
}
