import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import 'fumadocs-ui/style.css';

const SITE_URL = 'https://ziroagent.com';
const SITE_NAME = 'ZiroAgent SDK';
const SITE_DESCRIPTION =
  'Production-safe TypeScript agent runtime: durable execution, cost guardrails, replayable traces, MCP-native, sovereign-ready.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — TypeScript agent runtime for production`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'ZiroAgent', url: SITE_URL }],
  creator: 'ZiroAgent',
  publisher: 'ZiroAgent',
  keywords: [
    'ai agents',
    'typescript',
    'agent framework',
    'agent sdk',
    'llm',
    'openai',
    'anthropic',
    'claude',
    'gpt',
    'mcp',
    'model context protocol',
    'rag',
    'vector database',
    'pgvector',
    'workflow',
    'observability',
    'opentelemetry',
    'tracing',
    'durable execution',
    'cost guardrails',
    'replayable traces',
  ],
  category: 'technology',
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — TypeScript agent runtime for production`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: `${SITE_URL}/og.png`,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — TypeScript agent runtime for production`,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og.png`],
    site: '@ziroagent',
    creator: '@ziroagent',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
