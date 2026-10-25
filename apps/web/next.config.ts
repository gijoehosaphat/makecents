import path from 'path'
import { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't generate AGENTS.md on every dev start
  agentRules: false,
  async redirects() {
    return [
      {
        source: '/:accountId/dashboard/settings',
        destination: '/:accountId/dashboard/settings/categories',
        permanent: true,
      },
    ]
  },
  turbopack: {
    // The workspace root, so dependencies hoisted into the root node_modules (pnpm workspace) resolve
    root: path.join(__dirname, '../../'),
  },
  // Extra hosts (e.g. LAN IPs) come from a comma-separated ALLOWED_DEV_ORIGINS in .env
  allowedDevOrigins: [
    'localhost',
    ...(process.env.ALLOWED_DEV_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],
}

const withNextIntl = createNextIntlPlugin()
export default withNextIntl(nextConfig)
