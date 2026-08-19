// The React side of the install nudge: the platform capability (src/platform/
// install.ts) and the timing gate (installNudge.ts) wired into one small piece
// of view state. All the "when" lives in the pure gate; all the "how" lives in
// the platform module. This file only decides what is on screen.

import { useCallback, useEffect, useState } from 'react'
import {
  getInstallCapability,
  promptInstall,
  subscribeInstallCapability,
  type InstallCapability
} from '../platform/install'
import {
  countInstallSession,
  dismissInstallNudge,
  hasInstallEngagement,
  markInstallNudgeShown,
  shouldShowInstallNudge,
  subscribeInstallEngagement,
  wasInstallNudgeDismissed,
  wasInstallNudgeShown
} from './installNudge'

// A short beat after the qualifying moment (a note just saved) so the
// suggestion arrives into a settled screen instead of racing the save
// transition. Calm is partly a matter of timing, not just styling.
const NUDGE_DELAY_MS = 1500

export interface InstallPromptState {
  /** What this browser can offer: replay a prompt, hint at Share, or nothing. */
  capability: InstallCapability
  /** The one automatic, once-ever nudge. */
  nudgeVisible: boolean
  /** The iOS Share-then-Add hint, opened deliberately from the menu. */
  hintVisible: boolean
  /** The permanent menu entry's handler. Prompts on Chromium, hints on iOS. */
  openInstall: () => void
  /** The nudge's "Install"/"Show me" affordance. */
  acceptNudge: () => void
  /** One-tap "Not now" — final, forever. */
  dismissNudge: () => void
  closeHint: () => void
}

export function useInstallPrompt(): InstallPromptState {
  const [capability, setCapability] = useState<InstallCapability>(() => getInstallCapability())
  const [nudgeVisible, setNudgeVisible] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)

  // Chromium fires beforeinstallprompt after load, so the capability can turn
  // from 'none' into 'prompt' a moment into the session.
  useEffect(() => subscribeInstallCapability(setCapability), [])

  // Count this app-open exactly once, then re-run the gate whenever something
  // it depends on moves: the capability arriving, or a note being saved.
  useEffect(() => {
    const sessionCount = countInstallSession()
    let timer: ReturnType<typeof setTimeout> | null = null

    const evaluate = (): void => {
      if (timer !== null) return
      const allowed = shouldShowInstallNudge({
        capability: getInstallCapability(),
        sessionCount,
        engaged: hasInstallEngagement(),
        shown: wasInstallNudgeShown(),
        dismissed: wasInstallNudgeDismissed()
      })
      if (!allowed) return
      timer = setTimeout(() => {
        timer = null
        // Re-check at fire time: the gate is cheap and the world may have moved
        // (installed in another tab, dismissed elsewhere) during the delay.
        if (
          !shouldShowInstallNudge({
            capability: getInstallCapability(),
            sessionCount,
            engaged: hasInstallEngagement(),
            shown: wasInstallNudgeShown(),
            dismissed: wasInstallNudgeDismissed()
          })
        ) {
          return
        }
        // Written as it appears, not as it is dismissed: "at most once" must
        // hold even if the reader closes the tab without answering.
        markInstallNudgeShown()
        setNudgeVisible(true)
      }, NUDGE_DELAY_MS)
    }

    evaluate()
    const unsubEngagement = subscribeInstallEngagement(evaluate)
    const unsubCapability = subscribeInstallCapability(evaluate)
    return () => {
      if (timer !== null) clearTimeout(timer)
      unsubEngagement()
      unsubCapability()
    }
  }, [])

  const runPrompt = useCallback(() => {
    void promptInstall()
  }, [])

  const openInstall = useCallback(() => {
    if (getInstallCapability() === 'prompt') {
      runPrompt()
      return
    }
    setHintVisible(true)
  }, [runPrompt])

  const acceptNudge = useCallback(() => {
    setNudgeVisible(false)
    // Accepting is also an answer: the nudge's job is done either way.
    dismissInstallNudge()
    if (getInstallCapability() === 'prompt') {
      runPrompt()
    } else {
      setHintVisible(true)
    }
  }, [runPrompt])

  const dismissNudge = useCallback(() => {
    setNudgeVisible(false)
    dismissInstallNudge()
  }, [])

  const closeHint = useCallback(() => setHintVisible(false), [])

  return {
    capability,
    nudgeVisible,
    hintVisible,
    openInstall,
    acceptNudge,
    dismissNudge,
    closeHint
  }
}
