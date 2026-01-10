import path from 'path'
import { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
    // options
    root: path.join(__dirname, './'),
  },
}

const withNextIntl = createNextIntlPlugin()
export default withNextIntl(nextConfig)
