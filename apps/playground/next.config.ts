import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: false },
  // Workspace packages are already TS — let Next.js compile them.
  transpilePackages: [
    '@ziroagent/core',
    '@ziroagent/openai',
    '@ziroagent/anthropic',
    '@ziroagent/tools',
    '@ziroagent/agent',
    '@ziroagent/tracing',
  ],
};

export default nextConfig;
