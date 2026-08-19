import { describe, it, expect } from 'vitest'
import { anchoredPopoverPosition } from './displayPopover'

const VIEWPORT = { width: 1280, height: 800 }
const PANEL = { width: 320, height: 400 }

// A trigger sitting in a reading top bar: 30px square, near the right edge.
function trigger(
  left: number,
  top: number
): {
  top: number
  bottom: number
  left: number
  right: number
} {
  return { left, right: left + 30, top, bottom: top + 30 }
}

describe('anchoredPopoverPosition', () => {
  it('opens below the trigger, right edges aligned', () => {
    const pos = anchoredPopoverPosition(trigger(1000, 60), PANEL, VIEWPORT)
    expect(pos.top).toBe(98) // bottom (90) + gap (8)
    expect(pos.left).toBe(1030 - PANEL.width)
  })

  it('flips above when there is no room below and more room above', () => {
    const pos = anchoredPopoverPosition(trigger(1000, 700), PANEL, VIEWPORT)
    expect(pos.top).toBe(700 - 8 - PANEL.height)
  })

  it('stays below when below is tight but above is tighter', () => {
    const pos = anchoredPopoverPosition(trigger(1000, 120), PANEL, VIEWPORT)
    // Below has 650px of room for a 400px panel — no reason to flip.
    expect(pos.top).toBe(158)
  })

  it('clamps to the left margin when the trigger is near the left edge', () => {
    const pos = anchoredPopoverPosition(trigger(20, 60), PANEL, VIEWPORT)
    expect(pos.left).toBe(12)
  })

  it('clamps to the right margin when the trigger is hard against the right edge', () => {
    const pos = anchoredPopoverPosition(trigger(1270, 60), PANEL, VIEWPORT)
    expect(pos.left).toBe(VIEWPORT.width - PANEL.width - 12)
  })

  it('pins to the margin rather than going off-screen when the panel is too big', () => {
    const pos = anchoredPopoverPosition(
      trigger(300, 300),
      { width: 400, height: 900 },
      { width: 360, height: 640 }
    )
    expect(pos.left).toBe(12)
    expect(pos.top).toBe(12)
  })
})
