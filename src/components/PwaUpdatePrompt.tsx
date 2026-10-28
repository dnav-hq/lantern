import React from 'react'

// Headless since 2026-10-28. The "A new version is available" pill is gone:
// updates now apply silently (src/offline/pwaUpdate.ts) — when the page has
// been hidden for a while and comes back, or on the next full launch — never
// while the reader is looking at the page. The component stays mounted from
// main.tsx so that file needs no change; it renders nothing.
export default function PwaUpdatePrompt(): React.ReactElement | null {
  return null
}
