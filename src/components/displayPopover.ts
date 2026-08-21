// Positioning for the desktop, anchored form of the display-settings popover
// (DisplaySettings.tsx). Pure on purpose: the component measures the trigger
// and the panel, this decides where the panel goes, and the decision is
// unit-tested without a DOM.
//
// On mobile the popover is a bottom sheet laid out entirely by CSS, so none of
// this runs there.

export interface Rect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface Size {
  width: number
  height: number
}

export interface Position {
  top: number
  left: number
}

/** Gap between the trigger and the panel, and the minimum breathing room kept
 * between the panel and the edge of the window. */
const GAP = 8
const MARGIN = 12

function clamp(value: number, min: number, max: number): number {
  // A panel taller/wider than the space available pins to `min` rather than
  // inverting, so it never lands off the top/left edge where it can't be read.
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

/**
 * Where to put an anchored popover, in viewport (position: fixed) coordinates.
 *
 * Right edge aligns to the trigger's right edge — the trigger sits at the end
 * of the reading controls, so a right-aligned panel opens inward. Opens below
 * the trigger, flipping above only when below would overflow AND there is more
 * room above. Always clamped inside the viewport.
 */
export function anchoredPopoverPosition(anchor: Rect, panel: Size, viewport: Size): Position {
  const left = clamp(anchor.right - panel.width, MARGIN, viewport.width - panel.width - MARGIN)

  const below = anchor.bottom + GAP
  const roomBelow = viewport.height - MARGIN - below
  const roomAbove = anchor.top - GAP - MARGIN
  const flip = roomBelow < panel.height && roomAbove > roomBelow
  const top = flip ? anchor.top - GAP - panel.height : below

  return { top: clamp(top, MARGIN, viewport.height - panel.height - MARGIN), left }
}
