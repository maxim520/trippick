import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['navago-widget'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
