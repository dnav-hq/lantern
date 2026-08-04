import { useEffect, useRef, useState } from 'react'

/* ─── Auto-hiding reading chrome ──────────────────────────────────────────────
   The scroll-direction machine behind mobile Safari-style chrome: scroll down
   and the top bar slides away, scroll up and it comes straight back.

   The decision is a PURE reducer (nextChromeState) so the feel is testable
   without a browser. Two properties matter more than the thresholds themselves:

   1. It is momentum-aware, not per-event. A single scroll gesture fires dozens
      of events; reacting to each one's sign makes the bar flicker on the tiny
      direction reversals a finger (or a trackpad's inertia) produces. Instead
      we accumulate travel since the last direction flip and only act once it
      passes a threshold — a flick down hides once, a jitter does nothing.
   2. Revealing is cheaper than hiding (SHOW_THRESHOLD < HIDE_THRESHOLD). The
      reader asking for the chrome back should never have to ask twice; the
      reader who is reading should not lose it to a stray thumb.

   Overscroll (iOS rubber-band past either end) is clamped away before any of
   this runs, so a bounce can never toggle the chrome. */

export interface ChromeScrollState {
  /** Whether the chrome should currently be on screen. */
  visible: boolean
  /** Clamped scrollTop of the last sample. */
  lastY: number
  /** Signed travel accumulated since the last direction change. */
  travel: number
}

export interface ScrollSample {
  /** scrollTop */
  y: number
  /** scrollHeight - clientHeight, i.e. the largest legal scrollTop */
  maxY: number
}

/** Within this many px of the top the chrome is always shown. */
export const REVEAL_ZONE = 8
/** Downward travel (px) needed to hide. Roughly one thumb-flick. */
export const HIDE_TRAVEL = 56
/** Upward travel (px) needed to reveal — deliberately smaller/snappier. */
export const SHOW_TRAVEL = 14
/** Never hide before the reader is genuinely into the text. */
export const HIDE_FLOOR = 96

export function initialChromeState(y = 0): ChromeScrollState {
  return { visible: true, lastY: y, travel: 0 }
}

/**
 * Fold one scroll sample into the chrome state. Returns the SAME object when
 * nothing changed, so callers can skip a re-render with a plain identity check.
 */
export function nextChromeState(state: ChromeScrollState, sample: ScrollSample): ChromeScrollState {
  const maxY = Math.max(0, sample.maxY)
  const y = Math.min(Math.max(sample.y, 0), maxY)
  const delta = y - state.lastY

  // Content that barely overflows has nothing to gain from hiding, and hiding
  // there would strand the reader with chrome they cannot scroll back into view.
  if (maxY <= HIDE_FLOOR) {
    return state.visible && state.travel === 0 && state.lastY === y
      ? state
      : { visible: true, lastY: y, travel: 0 }
  }

  if (y <= REVEAL_ZONE) {
    return state.visible && state.travel === 0 && state.lastY === y
      ? state
      : { visible: true, lastY: y, travel: 0 }
  }

  if (delta === 0) return state

  // Reset the accumulator on a direction flip so travel always measures one
  // continuous gesture rather than a net figure across a whole reading session.
  const sameDirection = state.travel !== 0 && delta > 0 === state.travel > 0
  const travel = sameDirection ? state.travel + delta : delta

  if (travel >= HIDE_TRAVEL && y > HIDE_FLOOR) {
    return { visible: false, lastY: y, travel: 0 }
  }
  if (travel <= -SHOW_TRAVEL) {
    return state.visible
      ? { ...state, lastY: y, travel: 0 }
      : { visible: true, lastY: y, travel: 0 }
  }
  return { visible: state.visible, lastY: y, travel }
}

/**
 * Drive nextChromeState off a scroll container and report visibility changes.
 *
 * Samples are coalesced into one rAF per frame: scroll fires far more often
 * than the compositor paints, and reading `scrollTop` in the handler rather
 * than the frame callback is what turns a smooth hide into a janky one.
 *
 * Returns the current visibility, and calls `onChange` whenever it flips (so a
 * parent can own the class without prop-drilling a setter through the tree).
 */
export function useChromeAutoHide(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onChange?: (visible: boolean) => void,
  // Changing this re-initialises the machine to fully-visible. Pass the current
  // chapter so navigating (click OR swipe) always lands with the chrome shown,
  // deterministically — instead of the auto-hide flip-flopping as the scroll
  // position resets under it on each chapter change.
  resetKey?: unknown
): boolean {
  const [visible, setVisible] = useState(true)
  // Kept in a ref so the listener never needs re-binding as state advances.
  const stateRef = useRef<ChromeScrollState>(initialChromeState())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) {
      stateRef.current = initialChromeState()
      setVisible(true)
      onChangeRef.current?.(true)
      return
    }

    stateRef.current = initialChromeState(el.scrollTop)
    setVisible(true)
    onChangeRef.current?.(true)
    let frame = 0

    const sample = (): void => {
      frame = 0
      const node = ref.current
      if (!node) return
      const next = nextChromeState(stateRef.current, {
        y: node.scrollTop,
        maxY: node.scrollHeight - node.clientHeight
      })
      if (next === stateRef.current) return
      const flipped = next.visible !== stateRef.current.visible
      stateRef.current = next
      if (flipped) {
        setVisible(next.visible)
        onChangeRef.current?.(next.visible)
      }
    }

    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(sample)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
      // Leaving the surface must never strand the chrome off-screen.
      onChangeRef.current?.(true)
    }
  }, [ref, enabled, resetKey])

  return visible
}
