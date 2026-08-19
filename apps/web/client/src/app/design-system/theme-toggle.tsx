'use client'

import { useState } from 'react'

import { Button } from '@repo/ui/components/button'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'),
  )

  return (
    <Button
      variant="outline"
      color="neutral"
      onClick={() => {
        document.documentElement.classList.toggle('dark')
        setIsDark((prev) => !prev)
      }}
    >
      {isDark ? 'Switch to light' : 'Switch to dark'}
    </Button>
  )
}
