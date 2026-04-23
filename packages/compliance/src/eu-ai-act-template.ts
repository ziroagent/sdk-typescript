export interface EuAiActTechnicalDocVars {
  systemName: string;
  intendedPurpose: string;
  humanOversight: string;
  trainingDataSummary?: string;
  riskMitigations?: string;
}

/**
 * Starter skeleton for Annex IV-style technical documentation (not legal advice).
 */
export function renderEuAiActTechnicalDocTemplate(vars: EuAiActTechnicalDocVars): string {
  const training = vars.trainingDataSummary ?? '(describe training / fine-tuning data sources)';
  const risks = vars.riskMitigations ?? '(list residual risks and mitigations)';
  return [
    '# EU AI Act — Technical documentation (draft template)',
    '',
    `_Generated for system **${vars.systemName}**. Fill all bracketed sections before submission._`,
    '',
    '## 1. General description',
    `- **Intended purpose:** ${vars.intendedPurpose}`,
    '',
    '## 2. Development process',
    `- **Training / data:** ${training}`,
    '',
    '## 3. Human oversight',
    vars.humanOversight,
    '',
    '## 4. Risk management',
    risks,
    '',
    '## 5. Logging & post-market monitoring',
    '- Reference your `@ziro-agent/audit` JSONL chain and trace retention policy.',
    '',
  ].join('\n');
}
