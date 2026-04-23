export const COMPLIANCE_REPORT_SCHEMA = 'ziroagent.compliance.report/v1' as const;

export interface ComplianceReportInput {
  generatedAt: string;
  productName: string;
  dataProcessingSummary: string;
  retentionDaysByDataset: Record<string, number>;
  /** Optional SOC2-style control assertions your org fills in. */
  controls?: Record<string, { status: 'pass' | 'fail' | 'not_applicable'; notes?: string }>;
  /**
   * Optional resolved package versions (e.g. from `package.json` / lockfile) for
   * SOC2 / audit appendices.
   */
  packageVersions?: Record<string, string>;
}

/** Machine-readable summary suitable for CI `ziroagent compliance report`. */
export function buildComplianceReportJson(input: ComplianceReportInput): Record<string, unknown> {
  return {
    schema: COMPLIANCE_REPORT_SCHEMA,
    generatedAt: input.generatedAt,
    productName: input.productName,
    dataProcessingSummary: input.dataProcessingSummary,
    retentionDaysByDataset: input.retentionDaysByDataset,
    ...(input.controls ? { controls: input.controls } : {}),
    ...(input.packageVersions ? { packageVersions: input.packageVersions } : {}),
  };
}
