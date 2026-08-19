import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'Starter Kit',
  description: 'Turborepo starter kit',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
