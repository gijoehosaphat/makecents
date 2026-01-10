import { Lato } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'

const lato = Lato({
  weight: ['100', '300', '400', '700', '900'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={'en'} className={lato.className}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
