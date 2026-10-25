import { Lato } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import type { Viewport } from 'next'
import { defaultTheme } from '@/lib/theme'
import '@/styles/root.css'

const lato = Lato({
  weight: ['100', '300', '400', '700', '900'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

// Tells the browser up front that the page is dark, so its default canvas (shown before any CSS arrives, and between
// page loads) isn't white.
export const viewport: Viewport = {
  colorScheme: defaultTheme.palette.mode,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={'en'}
      className={lato.className}
      // Inline, so the themed background paints with the very first byte of HTML rather than once MUI's styles load
      style={{ backgroundColor: defaultTheme.palette.background.default, colorScheme: defaultTheme.palette.mode }}
    >
      <body>
        <AppRouterCacheProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
