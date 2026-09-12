import { describe, it, expect } from 'vitest'
import { withinSlop, LONG_PRESS_SLOP, LONG_PRESS_MS } from './useLongPress'

describe('long-press slop', () => {
  const down = { x: 100, y: 200, fired: false }

  it('a finger that holds still is still a press', () => {
    expect(withinSlop(down, 100, 200)).toBe(true)
    expect(withinSlop(down, 100 + LONG_PRESS_SLOP, 200 - LONG_PRESS_SLOP)).toBe(true)
  })

  it('a finger that starts to scroll is not', () => {
    expect(withinSlop(down, 100, 200 + LONG_PRESS_SLOP + 1)).toBe(false)
    expect(withinSlop(down, 100 - LONG_PRESS_SLOP - 1, 200)).toBe(false)
  })

  it('the hold is a beat, not a wait', () => {
    // Short enough to feel responsive, long enough that a tap never trips it.
    expect(LONG_PRESS_MS).toBeGreaterThanOrEqual(350)
    expect(LONG_PRESS_MS).toBeLessThanOrEqual(600)
  })
})
