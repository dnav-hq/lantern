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

/** How long a freshly-armed programmatic scroll is trusted to START (ms). */
export const PROGRAMMATIC_ARM_WINDOW = 800
/** Once it is scrolling, how long after the last event it is still "ours" (ms). */
export const PROGRAMMATIC_IDLE_WINDOW = 160

/**
 * Programmatic scrolls (scrollIntoView on a search result, a note chip, a
 * cross-ref) look exactly like a thumb-flick to the machine: a long downward
 * travel, arriving whenever the data happens to land — usually AFTER the
 * navigation settle window. Pages arm this guard right before they scroll so
 * the hook can tell the two apart. The guard is a deadline in performance.now()
 * time: it expires on its own if the scroll never fires (target already in
 * view), and keeps extending while the smooth scroll is still emitting events.
 */
export type ProgrammaticScrollGuard = React.MutableRefObject<number>

export function armProgrammaticScroll(guard: ProgrammaticScrollGuard | undefined): void {
  if (guard) guard.current = performance.now() + PROGRAMMATIC_ARM_WINDOW
}

/**
 * Pure decision for one scroll sample under a guard: returns the extended
 * deadline while the sample is still part of the programmatic scroll, or null
 * once the guard has lapsed and the sample belongs to the reader.
 */
export function nextGuardDeadline(deadline: number, now: number): number | null {
  if (now >= deadline) return null
  return Math.max(deadline, now + PROGRAMMATIC_IDLE_WINDOW)
}

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
  resetKey?: unknown,
  // See armProgrammaticScroll: samples inside the guard re-anchor the machine
  // instead of driving it, so a scroll the PAGE asked for never hides chrome.
  programmaticGuard?: ProgrammaticScrollGuard
): boolean {
  const [visible, setVisible] = useState(true)
  // Kept in a ref so the listener never needs re-binding as state advances.
  const stateRef = useRef<ChromeScrollState>(initialChromeState())
  // The last sample's scrollable height. Toggling the chrome animates the
  // reading surface's bottom tail (it eases open/closed with the tab bar), so
  // scrollHeight changes for a few frames after every flip. Near the bottom
  // that shrink CLAMPS scrollTop, and an unguarded machine reads the clamp as
  // an upward scroll and re-reveals — a hide/show oscillation on the smallest
  // scroll-down. Absorbing any sample whose maxY moved breaks that loop: the
  // layout settling is not a gesture, so it must never change visibility.
  const lastMaxYRef = useRef(0)
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
    lastMaxYRef.current = el.scrollHeight - el.clientHeight
    setVisible(true)
    onChangeRef.current?.(true)
    let frame = 0

    // Just after (re)mount and every chapter change (resetKey re-runs this
    // effect), the view programmatically scrolls to the top and reflows. Those
    // are NOT the reader hiding the chrome, so we swallow them for a short
    // settle window — the chrome stays put and never flickers on navigation.
    let settling = true
    const settleTimer = setTimeout(() => {
      settling = false
      const node = ref.current
      if (node) {
        stateRef.current = initialChromeState(node.scrollTop)
        lastMaxYRef.current = node.scrollHeight - node.clientHeight
      }
    }, 400)

    const sample = (): void => {
      frame = 0
      const node = ref.current
      if (!node) return
      if (settling) {
        // Track the position so travel starts clean once settling ends, but
        // never change visibility during the window.
        stateRef.current = initialChromeState(node.scrollTop)
        lastMaxYRef.current = node.scrollHeight - node.clientHeight
        return
      }
      if (programmaticGuard && programmaticGuard.current > 0) {
        const extended = nextGuardDeadline(programmaticGuard.current, performance.now())
        if (extended !== null) {
          programmaticGuard.current = extended
          stateRef.current = initialChromeState(node.scrollTop)
          lastMaxYRef.current = node.scrollHeight - node.clientHeight
          return
        }
        programmaticGuard.current = 0
        // Lapsed mid-sample: re-anchor here so the guard's tail never counts
        // as travel, and let the NEXT sample be the reader's.
        stateRef.current = initialChromeState(node.scrollTop)
        lastMaxYRef.current = node.scrollHeight - node.clientHeight
        return
      }
      const maxY = node.scrollHeight - node.clientHeight
      // A sample whose scrollable height moved is the bottom-tail animating as
      // the chrome toggles, not a finger — absorb it (re-anchor position, clear
      // travel) so the layout settling can never flip visibility and start the
      // hide/show oscillation. Real gestures arrive on a stable height.
      if (Math.abs(maxY - lastMaxYRef.current) > 0.5) {
        lastMaxYRef.current = maxY
        const clampedY = Math.min(Math.max(node.scrollTop, 0), Math.max(0, maxY))
        stateRef.current = { ...stateRef.current, lastY: clampedY, travel: 0 }
        return
      }
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
      clearTimeout(settleTimer)
      el.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
      // Leaving the surface must never strand the chrome off-screen.
      onChangeRef.current?.(true)
    }
  }, [ref, enabled, resetKey, programmaticGuard])

  return visible
}
