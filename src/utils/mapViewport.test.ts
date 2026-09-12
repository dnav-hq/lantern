import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  anchorViewBox,
  clampViewBox,
  fitViewBox,
  formatViewBox,
  interpolateViewBox,
  labelBudget,
  panViewBox,
  pinchViewBox,
  quantizeZoom,
  screenToView,
  unitsPerPixel,
  zoomLevel,
  zoomViewBox,
  type ScreenPoint,
  type ScreenRect,
  type ViewBox
} from './mapViewport'

const EXTENT: ViewBox = { x: 0, y: 0, w: 1000, h: 500 }
// A 500 × 250 px canvas: two artwork units per pixel at home.
const RECT: ScreenRect = { left: 100, top: 50, width: 500, height: 250 }
const FIT = fitViewBox(EXTENT, RECT)

const close = (a: ViewBox, b: ViewBox): void => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
  expect(a.w).toBeCloseTo(b.w, 6)
  expect(a.h).toBeCloseTo(b.h, 6)
}

describe('fitViewBox', () => {
  it('is the extent itself when the viewport shares its aspect', () => {
    close(FIT, EXTENT)
  })

  it('letterboxes vertically on a tall phone, centred on the extent', () => {
    const fit = fitViewBox(EXTENT, { width: 390, height: 780 })
    expect(fit.w).toBe(1000)
    expect(fit.h).toBe(2000)
    expect(fit.x).toBe(0)
    expect(fit.y).toBe(-750)
  })

  it('letterboxes horizontally on an ultra-wide viewport', () => {
    const fit = fitViewBox(EXTENT, { width: 4000, height: 500 })
    expect(fit.h).toBe(500)
    expect(fit.w).toBe(4000)
    expect(fit.x).toBe(-1500)
  })
})

describe('screenToView', () => {
  it('maps the rect corners to the viewBox corners', () => {
    expect(screenToView(FIT, RECT, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 })
    expect(screenToView(FIT, RECT, { x: 600, y: 300 })).toEqual({ x: 1000, y: 500 })
    expect(unitsPerPixel(FIT, RECT)).toBe(2)
  })
})

describe('clampViewBox', () => {
  it('never zooms out past the home view', () => {
    const huge = { x: -500, y: -500, w: 3000, h: 1500 }
    close(clampViewBox(huge, EXTENT, FIT), FIT)
  })

  it('never zooms in past MAX_ZOOM', () => {
    const tiny = { x: 500, y: 250, w: 1, h: 0.5 }
    const vb = clampViewBox(tiny, EXTENT, FIT)
    expect(zoomLevel(vb, FIT)).toBeCloseTo(MAX_ZOOM)
    expect(vb.h / vb.w).toBeCloseTo(FIT.h / FIT.w)
  })

  it('stops a pan at the artwork edge so it cannot be lost off-screen', () => {
    const zoomed = { x: -400, y: -400, w: 250, h: 125 }
    expect(clampViewBox(zoomed, EXTENT, FIT)).toEqual({ x: 0, y: 0, w: 250, h: 125 })
    const far = { x: 5000, y: 5000, w: 250, h: 125 }
    expect(clampViewBox(far, EXTENT, FIT)).toEqual({ x: 750, y: 375, w: 250, h: 125 })
  })

  it('centres the letterbox axis rather than clamping it', () => {
    const fit = fitViewBox(EXTENT, { width: 390, height: 780 })
    // Half zoom: 500 wide, 1000 tall — still taller than the 500-unit extent,
    // so y is centred on it; x is clamped inside it.
    const vb = clampViewBox({ x: 900, y: 900, w: 500, h: 1000 }, EXTENT, fit)
    expect(vb.x).toBe(500)
    expect(vb.y).toBe(-250)
  })

  it('restores the home aspect when a box arrives with the wrong one', () => {
    const skewed = { x: 0, y: 0, w: 400, h: 400 }
    const vb = clampViewBox(skewed, EXTENT, FIT)
    expect(vb.h / vb.w).toBeCloseTo(FIT.h / FIT.w)
  })
})

describe('anchorViewBox', () => {
  it('keeps the anchor point under the pixel it is aimed at', () => {
    const vb = anchorViewBox(FIT, 0.5, { x: 600, y: 300 }, { x: 350, y: 175 }, RECT)
    expect(vb.w).toBe(500)
    expect(vb.h).toBe(250)
    close(vb, { x: 350, y: 175, w: 500, h: 250 })
    // and reading the aimed pixel back gives the anchor
    expect(screenToView(vb, RECT, { x: 350, y: 175 })).toEqual({ x: 600, y: 300 })
  })
})

describe('panViewBox', () => {
  const zoomed: ViewBox = { x: 400, y: 200, w: 250, h: 125 }

  it('moves the artwork with the finger, in artwork units', () => {
    // 250 units across 500 px = 0.5 units per pixel; a 100 px drag right is 50 units left.
    const vb = panViewBox(zoomed, RECT, { x: 300, y: 150 }, { x: 400, y: 150 }, EXTENT, FIT)
    close(vb, { x: 350, y: 200, w: 250, h: 125 })
  })

  it('clamps at the edge', () => {
    const vb = panViewBox(zoomed, RECT, { x: 300, y: 150 }, { x: 5000, y: 5000 }, EXTENT, FIT)
    close(vb, { x: 0, y: 0, w: 250, h: 125 })
  })

  it('does nothing at home view — there is nowhere to pan', () => {
    close(panViewBox(FIT, RECT, { x: 300, y: 150 }, { x: 400, y: 190 }, EXTENT, FIT), FIT)
  })
})

describe('zoomViewBox', () => {
  it('zooms about the pointer: the artwork under it does not move', () => {
    const at = { x: 250, y: 100 }
    const before = screenToView(FIT, RECT, at)
    const vb = zoomViewBox(FIT, RECT, 2, at, EXTENT, FIT)
    expect(zoomLevel(vb, FIT)).toBeCloseTo(2)
    const after = screenToView(vb, RECT, at)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('zooming out from home is a no-op', () => {
    close(zoomViewBox(FIT, RECT, 0.5, { x: 250, y: 100 }, EXTENT, FIT), FIT)
  })

  it('caps at MAX_ZOOM', () => {
    const vb = zoomViewBox(FIT, RECT, 1000, { x: 350, y: 175 }, EXTENT, FIT)
    expect(zoomLevel(vb, FIT)).toBeCloseTo(MAX_ZOOM)
  })

  it('ignores a degenerate factor', () => {
    close(zoomViewBox(FIT, RECT, 0, { x: 350, y: 175 }, EXTENT, FIT), FIT)
    close(zoomViewBox(FIT, RECT, Number.NaN, { x: 350, y: 175 }, EXTENT, FIT), FIT)
  })
})

describe('pinchViewBox', () => {
  it('scales by the ratio of finger distances', () => {
    const prev: [ScreenPoint, ScreenPoint] = [
      { x: 300, y: 175 },
      { x: 400, y: 175 }
    ]
    const next: [ScreenPoint, ScreenPoint] = [
      { x: 250, y: 175 },
      { x: 450, y: 175 }
    ]
    const vb = pinchViewBox(FIT, RECT, prev, next, EXTENT, FIT)
    expect(zoomLevel(vb, FIT)).toBeCloseTo(2)
  })

  it('keeps the artwork under the midpoint as the midpoint moves', () => {
    const start: ViewBox = { x: 300, y: 150, w: 400, h: 200 }
    const prev: [ScreenPoint, ScreenPoint] = [
      { x: 300, y: 150 },
      { x: 400, y: 200 }
    ]
    const anchor = screenToView(start, RECT, { x: 350, y: 175 })
    const next: [ScreenPoint, ScreenPoint] = [
      { x: 330, y: 160 },
      { x: 450, y: 220 }
    ]
    const vb = pinchViewBox(start, RECT, prev, next, EXTENT, FIT)
    const nowUnder = screenToView(vb, RECT, { x: 390, y: 190 })
    expect(nowUnder.x).toBeCloseTo(anchor.x)
    expect(nowUnder.y).toBeCloseTo(anchor.y)
  })

  it('treats fingers on top of each other as no scale', () => {
    const same: [ScreenPoint, ScreenPoint] = [
      { x: 300, y: 175 },
      { x: 300, y: 175 }
    ]
    const apart: [ScreenPoint, ScreenPoint] = [
      { x: 200, y: 175 },
      { x: 400, y: 175 }
    ]
    close(pinchViewBox(FIT, RECT, same, apart, EXTENT, FIT), FIT)
  })
})

describe('helpers', () => {
  it('interpolates and clamps t', () => {
    const b: ViewBox = { x: 100, y: 50, w: 500, h: 250 }
    close(interpolateViewBox(FIT, b, 0.5), { x: 50, y: 25, w: 750, h: 375 })
    close(interpolateViewBox(FIT, b, 2), b)
  })

  it('formats a viewBox attribute', () => {
    expect(formatViewBox({ x: 0, y: 0.00004, w: 1000, h: 572.58 })).toBe('0 0 1000 572.58')
  })

  it('quantizes zoom to half-octaves and never below 1', () => {
    expect(quantizeZoom(0.5)).toBe(1)
    expect(quantizeZoom(1.1)).toBe(1)
    expect(quantizeZoom(1.5)).toBeCloseTo(Math.SQRT2)
    expect(quantizeZoom(3.9)).toBe(4)
  })

  it('grows the label budget with the square of the zoom', () => {
    expect(labelBudget(1)).toBe(40)
    expect(labelBudget(2)).toBe(160)
    expect(labelBudget(4)).toBe(640)
  })
})
