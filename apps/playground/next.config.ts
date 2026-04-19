import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  // Workspace packages are already TS — let Next.js compile them.
  transpilePackages: [
    '@ziro-ai/core',
    '@ziro-ai/openai',
    '@ziro-ai/anthropic',
    '@ziro-ai/tools',
    '@ziro-ai/agent',
    '@ziro-ai/tracing',
  ],
};

export default nextConfig;
