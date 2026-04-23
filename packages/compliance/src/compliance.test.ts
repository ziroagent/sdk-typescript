import { describe, expect, it } from 'vitest';
import { deleteUserDataInOrder } from './delete-user-data.js';
import { buildComplianceReportJson } from './report.js';
import { renderSoc2MarkdownReport } from './soc2/markdown-report.js';

describe('compliance', () => {
  it('deleteUserDataInOrder invokes hooks in RFC order', async () => {
    const order: string[] = [];
    await deleteUserDataInOrder(
      { userId: 'u1', threadIds: ['t1'] },
      {
        revokeSessions: async () => {
          order.push('sessions');
        },
        deleteAgentCheckpoints: async () => {
          order.push('checkpoints');
        },
        deleteConversationArtifacts: async () => {
          order.push('conversation');
        },
        deleteVectorTenantData: async () => {
          order.push('vector');
        },
        deleteAuditRecords: async () => {
          order.push('audit');
        },
      },
    );
    expect(order).toEqual(['sessions', 'checkpoints', 'conversation', 'vector', 'audit']);
  });

  it('buildComplianceReportJson includes schema', () => {
    const r = buildComplianceReportJson({
      generatedAt: '2026-01-01T00:00:00.000Z',
      productName: 'Demo',
      dataProcessingSummary: 'none',
      retentionDaysByDataset: { messages: 30 },
    });
    expect(r.schema).toBe('ziroagent.compliance.report/v1');
  });

  it('renderSoc2MarkdownReport includes control table', () => {
    const md = renderSoc2MarkdownReport({
      generatedAt: '2026-01-01T00:00:00.000Z',
      productName: 'Demo',
      dataProcessingSummary: 'Processes chat messages.',
      retentionDaysByDataset: { messages: 30 },
    });
    expect(md).toContain('CC6.1');
    expect(md).toContain('not legal or audit advice');
  });
});
