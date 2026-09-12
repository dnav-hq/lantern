import { useCallback, useEffect, useRef } from 'react'

/* ─── Long-press ──────────────────────────────────────────────────────────────
   Hover does not exist on a phone, so an affordance that appears on hover is
   invisible there. The touch convention for "there is more you can do with
   this row" is to hold it: the row acknowledges the press, and after a beat
   the extra options come up. This hook is that beat.

   Two properties matter:
   1. A hold that becomes a scroll is not a long-press. Any pointer travel past
      SLOP cancels it, so a reader scrolling a long picker never opens menus
      by accident.
   2. A completed long-press must SWALLOW the click that follows the release —
      otherwise holding a category row would open its options and then also
      pick the category, which is exactly the double action the hold avoids.

   The pure decision (withinSlop) is separated so the movement rule is
   unit-testable without pointer events. */

/** Hold this long (ms) before it counts. Matches the platform feel on both iOS and Android. */
export const LONG_PRESS_MS = 450
/** Pointer travel (px) that turns a hold into a scroll and cancels the press. */
export const LONG_PRESS_SLOP = 8

export interface PressState {
  /** Where the pointer went down. */
  x: number
  y: number
  /** Whether the hold has already fired. */
  fired: boolean
}

/** Does this pointer position still count as holding still? */
export function withinSlop(state: PressState, x: number, y: number): boolean {
  return Math.abs(x - state.x) <= LONG_PRESS_SLOP && Math.abs(y - state.y) <= LONG_PRESS_SLOP
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  /** Wrap the element's own click so a completed hold does not also click. */
  onClickCapture: (e: React.MouseEvent) => void
}

/**
 * Pointer handlers that call `onLongPress` after a still hold, and report the
 * press lifecycle through `onPressChange` so the row can show it is being held
 * (the feedback is what tells a reader the hold is doing something).
 *
 * Touch and pen only: a mouse has hover and a right-click, and a held mouse
 * button is a drag, not a request for options.
 */
export function useLongPress(
  onLongPress: () => void,
  onPressChange?: (pressing: boolean) => void
): LongPressHandlers {
  const timer = useRef(0)
  const state = useRef<PressState | null>(null)
  const onLongPressRef = useRef(onLongPress)
  onLongPressRef.current = onLongPress
  const onPressChangeRef = useRef(onPressChange)
  onPressChangeRef.current = onPressChange

  const clear = useCallback((): void => {
    if (timer.current !== 0) {
      window.clearTimeout(timer.current)
      timer.current = 0
    }
    if (state.current === null) return
    onPressChangeRef.current?.(false)
    // A fired press stays recorded until the click that follows the release
    // has been swallowed; onClickCapture resets it.
    if (!state.current.fired) state.current = null
  }, [])

  useEffect(() => clear, [clear])

  const onPointerDown = useCallback(
    (e: React.PointerEvent): void => {
      if (e.pointerType === 'mouse') return
      if (!e.isPrimary) return
      clear()
      state.current = { x: e.clientX, y: e.clientY, fired: false }
      onPressChangeRef.current?.(true)
      timer.current = window.setTimeout(() => {
        timer.current = 0
        if (state.current === null) return
        state.current.fired = true
        onPressChangeRef.current?.(false)
        // A short tick where the platform offers one. Silent elsewhere.
        try {
          navigator.vibrate?.(10)
        } catch {
          /* not available */
        }
        onLongPressRef.current()
      }, LONG_PRESS_MS)
    },
    [clear]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent): void => {
      const s = state.current
      if (s === null || s.fired) return
      if (!withinSlop(s, e.clientX, e.clientY)) clear()
    },
    [clear]
  )

  const onPointerUp = useCallback((): void => clear(), [clear])
  const onPointerCancel = useCallback((): void => clear(), [clear])

  // The browser's own long-press menu (copy / look up) must not race ours.
  const onContextMenu = useCallback((e: React.MouseEvent): void => {
    if (state.current !== null) e.preventDefault()
  }, [])

  const onClickCapture = useCallback((e: React.MouseEvent): void => {
    if (state.current?.fired) {
      e.preventDefault()
      e.stopPropagation()
      state.current = null
    }
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu,
    onClickCapture
  }
}
