import {
  buildComplianceReportJson,
  renderEuAiActTechnicalDocTemplate,
  renderSoc2MarkdownReport,
} from '@ziro-agent/compliance';
import type { Logger } from '../util/logger.js';

export interface ComplianceCommandOptions {
  cwd: string;
  logger: Logger;
  argv: string[];
  flags: Record<string, string | boolean | undefined>;
}

function parseJsonObject(raw: string, label: string): Record<string, number> {
  const trimmed = raw.trim();
  try {
    const o = JSON.parse(trimmed) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('expected object');
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch (e) {
    throw new Error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * `ziroagent compliance report|eu-ai-act-template`
 */
export async function runComplianceCommand(opts: ComplianceCommandOptions): Promise<number> {
  const { logger, argv, flags } = opts;
  const sub = argv[0];
  if (sub === 'report') {
    const productName = typeof flags.product === 'string' ? flags.product : 'ZiroAgent app';
    const summary =
      typeof flags.summary === 'string' ? flags.summary : 'Describe processing activities here.';
    const retentionRaw =
      typeof flags.retention === 'string'
        ? flags.retention
        : JSON.stringify({ messages: 30, checkpoints: 90 });
    const retention = parseJsonObject(retentionRaw, '--retention');
    const framework = typeof flags.framework === 'string' ? flags.framework.toLowerCase() : 'json';
    const baseInput = {
      generatedAt: new Date().toISOString(),
      productName,
      dataProcessingSummary: summary,
      retentionDaysByDataset: retention,
    };
    const text =
      framework === 'soc2'
        ? `${renderSoc2MarkdownReport(baseInput)}\n`
        : `${JSON.stringify(buildComplianceReportJson(baseInput), null, 2)}\n`;
    if (typeof flags.out === 'string') {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(flags.out, text, 'utf8');
      logger.info(`Wrote compliance report to ${flags.out}`);
    } else {
      process.stdout.write(text);
    }
    return 0;
  }

  if (sub === 'eu-ai-act-template') {
    const systemName = typeof flags.system === 'string' ? flags.system : 'My AI system';
    const intendedPurpose =
      typeof flags.purpose === 'string' ? flags.purpose : 'Assist users with operational tasks.';
    const humanOversight =
      typeof flags.oversight === 'string'
        ? flags.oversight
        : 'Human reviewers can approve high-risk tool calls via HITL.';
    const doc = renderEuAiActTechnicalDocTemplate({
      systemName,
      intendedPurpose,
      humanOversight,
    });
    if (typeof flags.out === 'string') {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(flags.out, doc, 'utf8');
      logger.info(`Wrote EU AI Act template to ${flags.out}`);
    } else {
      process.stdout.write(`${doc}\n`);
    }
    return 0;
  }

  logger.error(
    'Usage: ziroagent compliance report [--framework json|soc2] [--product name] [--summary text] [--retention json] [--out file]',
  );
  logger.error(
    '       ziroagent compliance eu-ai-act-template [--system name] [--purpose text] [--oversight text] [--out file]',
  );
  return 1;
}
