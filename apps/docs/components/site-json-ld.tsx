import type { ReactElement } from 'react';
import { jsonLdGraphScript } from '@/lib/jsonld';

/** Sitewide structured data: SoftwareApplication + WebSite (Schema.org). */
export function SiteJsonLd(): ReactElement {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw script body
      dangerouslySetInnerHTML={{ __html: jsonLdGraphScript() }}
    />
  );
}
