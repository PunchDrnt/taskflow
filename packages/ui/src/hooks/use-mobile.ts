import * as React from 'react'

// Matches --breakpoint-md (810px) in packages/config/tailwind/theme.css —
// Sidebar switches its own layout at `md:`, so this has to agree with that
// breakpoint or there's a dead zone where the CSS and the JS disagree.
const MOBILE_BREAKPOINT = 810

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

// SSR has no viewport to measure — false matches the desktop-first markup
// the server renders, so hydration never has to reconcile a mismatch.
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
