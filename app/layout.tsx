import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeProvider } from '@/lib/theme'
import './globals.css'

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'CSDTV Team Hub',
    template: '%s | CSDTV Team Hub',
  },
  description: 'Internal team management for CSDtv production office — productions, tasks, schedule, equipment',
  icons: {
    icon: '/favicon.svg',
    apple: '/images/CSDtv Logo - New Logo Outlined.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`light ${roboto.variable}`}>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}