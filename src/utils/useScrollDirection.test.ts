import { describe, it, expect } from 'vitest'
import {
  initialChromeState,
  nextChromeState,
  HIDE_FLOOR,
  HIDE_TRAVEL,
  SHOW_TRAVEL,
  REVEAL_ZONE,
  type ChromeScrollState
} from './useScrollDirection'

const LONG = 4000

/** Feed a sequence of absolute scroll positions through the reducer. */
function scrollThrough(ys: number[], maxY = LONG, from = initialChromeState()): ChromeScrollState {
  return ys.reduce((state, y) => nextChromeState(state, { y, maxY }), from)
}

describe('nextChromeState', () => {
  it('starts visible and stays visible at the top of the document', () => {
    const state = scrollThrough([0, REVEAL_ZONE])
    expect(state.visible).toBe(true)
  })

  it('hides once a downward flick passes the travel threshold', () => {
    const state = scrollThrough([HIDE_FLOOR + 1, HIDE_FLOOR + 1 + HIDE_TRAVEL])
    expect(state.visible).toBe(false)
  })

  it('does not hide while still within the floor, however far it has travelled', () => {
    // A whole HIDE_TRAVEL of movement, but all of it above HIDE_FLOOR.
    const state = scrollThrough([1, HIDE_FLOOR - 1])
    expect(state.visible).toBe(true)
  })

  it('ignores jitter: alternating small moves never cross a threshold', () => {
    let state = scrollThrough([HIDE_FLOOR + 200])
    state = { ...state, visible: true }
    const jitter: number[] = []
    let y = HIDE_FLOOR + 200
    for (let i = 0; i < 20; i++) {
      y += i % 2 === 0 ? 6 : -6
      jitter.push(y)
    }
    expect(scrollThrough(jitter, LONG, state).visible).toBe(true)
  })

  it('reveals again on a much smaller upward movement than it took to hide', () => {
    const hidden = scrollThrough([HIDE_FLOOR + 1, HIDE_FLOOR + 1 + HIDE_TRAVEL, 900])
    expect(hidden.visible).toBe(false)
    const revealed = nextChromeState(hidden, { y: 900 - SHOW_TRAVEL, maxY: LONG })
    expect(revealed.visible).toBe(true)
    expect(SHOW_TRAVEL).toBeLessThan(HIDE_TRAVEL)
  })

  it('resets accumulated travel on a direction flip, so a hide needs one clean gesture', () => {
    // Down 40 (below HIDE_TRAVEL), up 40, then down 40 again: the two downward
    // legs must NOT sum into a hide.
    const state = scrollThrough([
      HIDE_FLOOR + 100,
      HIDE_FLOOR + 140,
      HIDE_FLOOR + 100,
      HIDE_FLOOR + 140
    ])
    expect(state.visible).toBe(true)
  })

  it('always returns to visible when scrolled back to the top', () => {
    const hidden = scrollThrough([HIDE_FLOOR + 1, HIDE_FLOOR + 1 + HIDE_TRAVEL])
    expect(hidden.visible).toBe(false)
    expect(nextChromeState(hidden, { y: 0, maxY: LONG }).visible).toBe(true)
  })

  it('never hides when the content barely overflows the viewport', () => {
    const shortMax = HIDE_FLOOR - 1
    const state = scrollThrough([shortMax, 0, shortMax], shortMax)
    expect(state.visible).toBe(true)
  })

  it('clamps rubber-band overscroll past both ends so a bounce cannot toggle it', () => {
    // iOS reports negative scrollTop at the top and beyond-max at the bottom.
    const bounced = scrollThrough([-120, -40, 0])
    expect(bounced.visible).toBe(true)

    const atBottom = scrollThrough([HIDE_FLOOR + 1, HIDE_FLOOR + 1 + HIDE_TRAVEL, LONG])
    expect(atBottom.visible).toBe(false)
    // Overscrolling past the end reports y > maxY; clamped, it is no movement,
    // so the rebound that follows must not read as a reveal-sized scroll up.
    const overscrolled = nextChromeState(atBottom, { y: LONG + 90, maxY: LONG })
    expect(overscrolled.visible).toBe(false)
    expect(nextChromeState(overscrolled, { y: LONG - 5, maxY: LONG }).visible).toBe(false)
  })

  it('returns the identical state object when a sample changes nothing', () => {
    const state = scrollThrough([HIDE_FLOOR + 200])
    expect(nextChromeState(state, { y: HIDE_FLOOR + 200, maxY: LONG })).toBe(state)
  })
})
