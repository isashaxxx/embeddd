import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  outputFileTracingIncludes: {
    '/api/admin/migrate/**': ['./db/schema.sql', './migrations/*.sql'],
  },
};

export default config;
