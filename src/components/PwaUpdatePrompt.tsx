import React, { useEffect, useState } from 'react'
import { onPwaNeedRefresh, applyPwaUpdate } from '../offline/pwaUpdate'
import { isStandalone } from '../platform/install'

// A quiet, dismissible "a new version is ready" pill. Replaces the old
// autoUpdate behaviour that force-reloaded the app a few seconds into a
// session. Refresh applies the update on the reader's terms; dismiss keeps the
// current session untouched (the update lands on the next full launch anyway).
export default function PwaUpdatePrompt(): React.ReactElement | null {
  const [show, setShow] = useState(false)
  useEffect(() => onPwaNeedRefresh(() => setShow(true)), [])
  if (!show) return null
  // Only surfaces in the INSTALLED app, which is the only place this pill has
  // a job: a standalone PWA's service worker holds an old build until a full
  // relaunch, and there is no address bar to reload from. In a browser tab a
  // plain reload already fetches the new build, so the pill is pure noise.
  //
  // This deliberately does NOT ask how wide the window is. The first version of
  // this guard tested `min-width: 769px` and called anything narrower "mobile",
  // so a desktop reader with a split window — or, far more likely for a reading
  // app, browser zoom, which shrinks the CSS viewport — was shown the pill
  // mid-passage. Width was never the question; install context was.
  if (!isStandalone()) return null
  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <span className="pwa-update-text">A new version is available.</span>
      <button type="button" className="pwa-update-later" onClick={() => setShow(false)}>
        Later
      </button>
      <button type="button" className="pwa-update-refresh" onClick={applyPwaUpdate}>
        Reload
      </button>
    </div>
  )
}
