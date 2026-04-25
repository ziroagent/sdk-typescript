import {
  DOCS_URL,
  GITHUB_REPO_URL,
  NPM_ORG_URL,
  NPM_PRIMARY_PACKAGE_URL,
  OG_IMAGE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from '@/lib/site';

const SCHEMA = 'https://schema.org';

/** Primary SDK product (rich results / knowledge graph). */
export function softwareApplicationJsonLd(): Record<string, unknown> {
  return {
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    programmingLanguage: 'TypeScript',
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    codeRepository: GITHUB_REPO_URL,
    downloadUrl: NPM_PRIMARY_PACKAGE_URL,
    installUrl: NPM_ORG_URL,
    screenshot: OG_IMAGE_URL,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    publisher: {
      '@type': 'Organization',
      name: 'ZiroAgent',
      url: SITE_URL,
      sameAs: [GITHUB_REPO_URL, NPM_ORG_URL, 'https://x.com/ziroagent'],
    },
  };
}

export function webSiteJsonLd(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    inLanguage: 'en-US',
    publisher: {
      '@type': 'Organization',
      name: 'ZiroAgent',
      url: SITE_URL,
    },
    potentialAction: {
      '@type': 'ReadAction',
      target: DOCS_URL,
    },
  };
}

export function jsonLdGraphScript(): string {
  return JSON.stringify({
    '@context': SCHEMA,
    '@graph': [softwareApplicationJsonLd(), webSiteJsonLd()],
  });
}
