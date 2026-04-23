/**
 * Starter mapping from SOC 2 Trust Services Criteria (summary ids) to ZiroAgent
 * primitives — extend per deployment; not audit advice.
 */
export interface Soc2ControlRow {
  /** e.g. `CC6.1` */
  id: string;
  criterion: string;
  /** Which SDK / product capabilities support the control narrative */
  ziroFeatures: readonly string[];
}

export const SOC2_CONTROL_MAP: readonly Soc2ControlRow[] = [
  {
    id: 'CC1.2',
    criterion: 'Board and management oversight',
    ziroFeatures: ['Explicit budgets (RFC 0001)', 'HITL approvals (RFC 0002)'],
  },
  {
    id: 'CC6.1',
    criterion: 'Logical access — authentication',
    ziroFeatures: ['Tool capability declarations (RFC 0013)', 'Sandbox adapters'],
  },
  {
    id: 'CC6.6',
    criterion: 'Logical access — authorization',
    ziroFeatures: ['Approver flows', 'Tool `requiresApproval`'],
  },
  {
    id: 'CC7.2',
    criterion: 'System monitoring',
    ziroFeatures: ['OpenTelemetry hooks (`@ziro-agent/tracing`)', 'Agent / model spans'],
  },
  {
    id: 'CC8.1',
    criterion: 'Change management',
    ziroFeatures: ['Semantic versioning', 'Changeset-gated releases'],
  },
  {
    id: 'A1.2',
    criterion: 'Availability monitoring',
    ziroFeatures: ['`modelFallback` + circuit breaker (`@ziro-agent/middleware`)'],
  },
  {
    id: 'C1.1',
    criterion: 'Privacy / confidentiality',
    ziroFeatures: ['`@ziro-agent/audit` JSONL chain', '`deleteUserDataInOrder` helper'],
  },
] as const;
