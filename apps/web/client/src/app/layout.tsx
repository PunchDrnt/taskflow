import type { Metadata } from 'next'

import './globals.css'

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
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
