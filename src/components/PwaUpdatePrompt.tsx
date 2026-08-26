import React, { useEffect, useState } from 'react'
import { onPwaNeedRefresh, applyPwaUpdate } from '../offline/pwaUpdate'

// A quiet, dismissible "a new version is ready" pill. Replaces the old
// autoUpdate behaviour that force-reloaded the app a few seconds into a
// session. Refresh applies the update on the reader's terms; dismiss keeps the
// current session untouched (the update lands on the next full launch anyway).
export default function PwaUpdatePrompt(): React.ReactElement | null {
  const [show, setShow] = useState(false)
  useEffect(() => onPwaNeedRefresh(() => setShow(true)), [])
  if (!show) return null
  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <span className="pwa-update-text">A new version is ready.</span>
      <button type="button" className="pwa-update-refresh" onClick={applyPwaUpdate}>
        Refresh
      </button>
      <button
        type="button"
        className="pwa-update-dismiss"
        aria-label="Dismiss"
        onClick={() => setShow(false)}
      >
        ✕
      </button>
    </div>
  )
}
