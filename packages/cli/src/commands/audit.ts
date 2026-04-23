import { verifyJsonlAuditLogFile } from '@ziro-agent/audit';

import type { Logger } from '../util/logger.js';

export interface AuditCommandOptions {
  logger: Logger;
  argv: string[];
}

/**
 * `ziroagent audit verify <file.jsonl>`
 */
export async function runAuditCommand(opts: AuditCommandOptions): Promise<number> {
  const { logger, argv } = opts;
  const sub = argv[0];
  if (sub === 'verify') {
    const path = argv[1];
    if (!path) {
      logger.error('Usage: ziroagent audit verify <audit.jsonl>');
      return 1;
    }
    const r = await verifyJsonlAuditLogFile(path);
    if (!r.ok) {
      logger.error(`Verify failed at line ${String(r.errorLine)}: ${r.error ?? 'unknown'}`);
      return 1;
    }
    logger.success(`OK — ${String(r.lineCount)} line(s)`);
    return 0;
  }

  logger.error('Usage: ziroagent audit verify <audit.jsonl>');
  return 1;
}
