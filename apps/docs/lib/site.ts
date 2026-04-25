/** Canonical URLs and copy shared by metadata + JSON-LD. */
export const SITE_URL = 'https://ziroagent.com';
export const SITE_NAME = 'ZiroAgent SDK';
export const SITE_DESCRIPTION =
  'Production-safe TypeScript agent runtime: durable execution, cost guardrails, replayable traces, MCP-native, sovereign-ready.';

export const GITHUB_REPO_URL = 'https://github.com/ziroagent/sdk-typescript';
export const NPM_ORG_URL = 'https://www.npmjs.com/org/ziro-agent';
export const NPM_PRIMARY_PACKAGE_URL = 'https://www.npmjs.com/package/@ziro-agent/agent';
export const DOCS_URL = `${SITE_URL}/docs`;
export const OG_IMAGE_URL = `${SITE_URL}/og.png`;

/** Single-locale site: declare English + x-default for crawlers (hreflang). */
export function hreflangLanguages(absoluteUrl: string): Record<string, string> {
  return {
    en: absoluteUrl,
    'en-US': absoluteUrl,
    'x-default': absoluteUrl,
  };
}
