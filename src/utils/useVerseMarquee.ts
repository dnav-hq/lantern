import { useCallback, useEffect, useRef, useState } from 'react'

// Windows-style marquee (box) selection over the scripture reading area
// (desktop only — touch keeps the existing tap-anchor/tap-extend gesture, see the
// `pointerType` guard below).
//
// It serves BOTH reading modes: in Read a drag makes a verse SELECTION, and in
// Study the very same drag re-aims the anchor of the note being written in the
// workbench (see BookDetailPage). The hook is unchanged either way — only the
// caller's `onRangeSelected` differs.
//
// On pointerdown inside the scripture container (but NOT on an interactive child
// — button, link, note pill, input, the floating action bar, anything marked
// [data-no-drag]) we begin tracking a rectangle from the start point to the
// current pointer and render a light selection-box overlay. As the box grows we
// hit-test every registered verse row: any row whose vertical extent intersects
// the box is inside the selection, and the min..max of intersected verse numbers
// drives the SAME `selAnchor`/`selFocus` state the tap gesture uses, so the
// existing floating action bar appears and works unchanged. On pointerup we
// commit and remove the overlay.
//
// Tradeoff (chosen by the user): click-drag over verse text now performs a
// marquee-select instead of native browser text selection/copy. We suppress
// native text selection for the duration of an active marquee drag (`user-select:
// none` on the container, restored on release) and `preventDefault` the
// initiating pointerdown. The escape hatch: holding Alt at pointerdown suppresses
// the marquee for that one gesture (see `shouldStartMarquee`), so native text
// selection runs and the verse text can be copied with Ctrl+C.
//
// Robustness / no stale state across gestures: per-gesture state
// (`dragMoved`/`justDragged`/rects) is reset at the START of every new
// pointerdown so nothing can leak from a prior interaction. A plain click (no
// movement past `DRAG_THRESHOLD`) is NOT a marquee — it falls through to the
// row's existing onClick (tap-anchor/tap-extend). After a real drag,
// `suppressNextClick` swallows exactly the one trailing `click` the browser
// emits (which may land on the container, a row, or verse text) so a stray
// post-drag click can never clear the range the marquee just made.

export interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

// The one input a pointerdown needs to decide whether it begins a marquee.
// Kept as a plain data shape (not a PointerEvent) so the decision is pure and
// DOM-free — unit-testable, and impossible to accidentally re-read from a live
// event whose modifier state changed mid-drag.
export interface MarqueeGestureInput {
  // 'mouse' | 'pen' | 'touch' — from PointerEvent.pointerType.
  pointerType: string
  // PointerEvent.button (0 = primary).
  button: number
  // PointerEvent.altKey AT pointerdown — the copy escape hatch.
  altKey: boolean
  // Whether the press landed on an interactive child / note surface that keeps
  // its own handling (computed by the caller via target.closest).
  onInteractiveTarget: boolean
}

// Should this pointerdown START a marquee box-selection, or fall through to the
// browser's native behaviour? The mode is decided ONCE, here, from the event's
// own state — so pressing or releasing Alt part-way through a drag can never
// switch modes mid-gesture (the marquee, once started, ignores modifiers).
//
//   - touch keeps the tap-anchor/tap-extend gesture (never a marquee)
//   - only a primary-button press starts a marquee
//   - holding Alt is the escape hatch: it suppresses the marquee so native text
//     selection runs and the verse text can be copied (Ctrl+C)
//   - interactive children / note surfaces keep their own handling
export function shouldStartMarquee(g: MarqueeGestureInput): boolean {
  if (g.pointerType === 'touch') return false
  if (g.button !== 0) return false
  if (g.altKey) return false
  if (g.onInteractiveTarget) return false
  return true
}

export function useVerseMarquee(
  containerRef: React.RefObject<HTMLElement>,
  verseRowRefs: React.MutableRefObject<Map<number, HTMLElement>>,
  onRangeSelected: (start: number | null, end: number | null) => void
): {
  isDragging: boolean
  marquee: MarqueeRect | null
  containerPointerDown: (e: React.PointerEvent) => void
  suppressNextClick: () => boolean
} {
  const [isDragging, setIsDragging] = useState(false)
  // The overlay rect, expressed relative to the container's padding box, or null
  // when no drag is active.
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)

  // Viewport-space anchor point of the current drag.
  const startClientX = useRef(0)
  const startClientY = useRef(0)
  const dragMoved = useRef(false)
  // True for exactly one subsequent click after a drag that actually moved, so
  // the native trailing `click` can't re-run tap-anchor logic and clobber the
  // range the marquee just committed. Reset at the START of the next pointerdown.
  const justDragged = useRef(false)

  // Minimum pointer movement (px) before a press-and-move is treated as a
  // marquee rather than a plain click.
  const DRAG_THRESHOLD = 4

  const onRangeSelectedRef = useRef(onRangeSelected)
  onRangeSelectedRef.current = onRangeSelected

  // Hit-test: select every verse whose row the box actually overlaps — on BOTH
  // axes. Vertical-only would mean a box drawn purely in the side whitespace (at
  // the same height as verses, but never crossing the verse rows) still selected
  // them; requiring horizontal overlap too means the box must genuinely cover the
  // verse text. If the box intersects no rows, the selection is cleared. Uses
  // viewport-space rects (getBoundingClientRect) so it survives scroll/zoom with
  // no measurement bookkeeping.
  const hitTest = useCallback(
    (
      leftClientX: number,
      rightClientX: number,
      topClientY: number,
      bottomClientY: number
    ): void => {
      let min: number | null = null
      let max: number | null = null
      for (const [verse, el] of verseRowRefs.current) {
        const r = el.getBoundingClientRect()
        const overlapsVert = r.bottom >= topClientY && r.top <= bottomClientY
        const overlapsHoriz = r.right >= leftClientX && r.left <= rightClientX
        if (overlapsVert && overlapsHoriz) {
          if (min === null || verse < min) min = verse
          if (max === null || verse > max) max = verse
        }
      }
      onRangeSelectedRef.current(min, max)
    },
    [verseRowRefs]
  )

  const endDrag = useCallback(() => {
    justDragged.current = dragMoved.current
    dragMoved.current = false
    setIsDragging(false)
    setMarquee(null)
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: PointerEvent): void => {
      const container = containerRef.current
      if (!container) return
      const dx = e.clientX - startClientX.current
      const dy = e.clientY - startClientY.current
      if (!dragMoved.current && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragMoved.current = true
      }
      if (!dragMoved.current) return

      // Box in viewport space.
      const topClientY = Math.min(startClientY.current, e.clientY)
      const bottomClientY = Math.max(startClientY.current, e.clientY)

      // Overlay rect relative to the container (so it can render as an absolutely
      // positioned child).
      const box = container.getBoundingClientRect()
      const leftClientX = Math.min(startClientX.current, e.clientX)
      const rightClientX = Math.max(startClientX.current, e.clientX)
      setMarquee({
        left: leftClientX - box.left + container.scrollLeft,
        top: topClientY - box.top + container.scrollTop,
        width: rightClientX - leftClientX,
        height: bottomClientY - topClientY
      })

      hitTest(leftClientX, rightClientX, topClientY, bottomClientY)
    }

    const handleUp = (): void => endDrag()

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [isDragging, endDrag, hitTest, containerRef])

  // Call from the row/container onClick before running tap logic; returns true
  // (and clears the flag) exactly once per completed drag.
  const suppressNextClick = useCallback((): boolean => {
    if (justDragged.current) {
      justDragged.current = false
      return true
    }
    return false
  }, [])

  const containerPointerDown = useCallback((e: React.PointerEvent) => {
    // Never start on interactive children or note surfaces — those keep their
    // own handling (a click on a note highlights; a drag from a note is not a
    // marquee). The origin is the full-width reading container, so drags that
    // begin in the side whitespace still start a selection.
    const target = e.target as HTMLElement
    const onInteractiveTarget = !!target.closest(
      'button, a, input, textarea, [contenteditable], [data-no-drag], .rail-note, .reading-note-card, .inline-verse-notes, .study-aside, .dialog-backdrop'
    )
    // Decide the mode once, from this event's own state. When it says no (touch,
    // non-primary button, Alt held, or an interactive target) we bail out BEFORE
    // touching user-select / preventDefault, so the browser's native gesture —
    // including Alt-drag text selection for copy — runs untouched.
    if (
      !shouldStartMarquee({
        pointerType: e.pointerType,
        button: e.button,
        altKey: e.altKey,
        onInteractiveTarget
      })
    )
      return

    // A fresh press always clears any stale suppression flag from a prior gesture.
    justDragged.current = false
    dragMoved.current = false
    startClientX.current = e.clientX
    startClientY.current = e.clientY
    setMarquee(null)
    setIsDragging(true)
    // Prevent the native text-selection that a press-drag over verse text would
    // otherwise begin; user-select:none keeps it suppressed for the whole drag.
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }, [])

  return { isDragging, marquee, containerPointerDown, suppressNextClick }
}
