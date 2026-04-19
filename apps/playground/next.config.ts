import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  // Workspace packages are already TS — let Next.js compile them.
  transpilePackages: [
    '@ziro-agent/core',
    '@ziro-agent/openai',
    '@ziro-agent/anthropic',
    '@ziro-agent/tools',
    '@ziro-agent/agent',
    '@ziro-agent/tracing',
  ],
};

export default nextConfig;
