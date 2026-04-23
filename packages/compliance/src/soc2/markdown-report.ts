import type { ComplianceReportInput } from '../report.js';
import { SOC2_CONTROL_MAP } from './control-map.js';

const DISCLAIMER = `_This document is a technical mapping aid only. It is not legal or audit advice and carries no warranty._`;

/**
 * Markdown report for auditors: packaged SOC2 rows + your processing summary.
 */
export function renderSoc2MarkdownReport(input: ComplianceReportInput): string {
  const lines: string[] = [
    '# SOC 2 — ZiroAgent control mapping (draft)',
    '',
    `**Product:** ${input.productName}`,
    `**Generated:** ${input.generatedAt}`,
    '',
    '## Data processing summary',
    '',
    input.dataProcessingSummary,
    '',
    '## Retention (days by dataset)',
    '',
    '| Dataset | Days |',
    '| --- | ---: |',
    ...Object.entries(input.retentionDaysByDataset).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Control mapping (starter)',
    '',
    '| Id | Criterion | ZiroAgent features |',
    '| --- | --- | --- |',
    ...SOC2_CONTROL_MAP.map((r) => `| ${r.id} | ${r.criterion} | ${r.ziroFeatures.join('; ')} |`),
    '',
    '## Declared controls (optional)',
    '',
  ];

  if (input.controls) {
    lines.push('| Control | Status | Notes |', '| --- | --- | --- |');
    for (const [id, c] of Object.entries(input.controls)) {
      const notes = c.notes ? c.notes.replace(/\|/g, '\\|') : '';
      lines.push(`| ${id} | ${c.status} | ${notes} |`);
    }
    lines.push('');
  } else {
    lines.push('_No per-control assertions supplied._', '');
  }

  lines.push('---', '', DISCLAIMER, '');
  return lines.join('\n');
}
