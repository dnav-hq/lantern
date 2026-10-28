import React, { useState } from 'react'

const SEEN_KEY = 'berean.guest-notice-seen'

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* shown again next time, which is the harmless direction to fail in */
  }
}

/**
 * Shown once ever, the first time a guest saves a note: a quiet strip saying
 * where that note lives and offering the way to keep it everywhere. Root
 * mounts it only after the guest api's first successful createNote, so a
 * visitor who only reads never meets it. Dismissal and sign-in both mark it
 * seen; nothing here is modal or blocks the page beneath.
 */
export default function GuestKeepNotice({
  onSignIn
}: {
  onSignIn: () => void
}): React.ReactElement | null {
  const [seen, setSeen] = useState(readSeen)
  if (seen) return null
  const dismiss = (): void => {
    writeSeen()
    setSeen(true)
  }
  return (
    <div className="guest-keep" role="status" aria-live="polite">
      <span className="guest-keep-text">
        Your notes are kept on this device. Sign in to keep them everywhere.
      </span>
      <button
        type="button"
        className="guest-keep-signin"
        onClick={() => {
          writeSeen()
          onSignIn()
        }}
      >
        Sign in
      </button>
      <button type="button" className="guest-keep-dismiss" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
