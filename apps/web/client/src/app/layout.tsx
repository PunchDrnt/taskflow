import type { Metadata } from 'next'
import { Chakra_Petch, IBM_Plex_Mono, Sarabun } from 'next/font/google'

import './globals.css'

// Self-hosted at build time by next/font rather than pulled from Google on
// every visit, which is what the design system's own `@import url(...)` does —
// that blocks first paint and leaks a request per page view.
//
// Thai subset on Sarabun because the product is Thai; Chakra Petch has no Thai
// coverage and is only ever used for display type.
const sarabun = Sarabun({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
})

// Named --font-kanit in the theme, and no longer Kanit: the design system moved
// the display face to Chakra Petch and the token name stayed.
const chakraPetch = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-chakra-petch',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Taskflow',
  description: 'Task management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="th"
      data-scroll-behavior="smooth"
      className={`${sarabun.variable} ${ibmPlexMono.variable} ${chakraPetch.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
