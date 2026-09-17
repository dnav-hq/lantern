import { describe, expect, it } from 'vitest'
import { chevronPathData, easeCalm, inFrame, legBows, legPathData, placeLabels } from './diveMap'

describe('legPathData and legBows', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }
  it('draws a straight leg by default', () => {
    expect(legPathData(a, b)).toBe('M0.00,0.00L10.00,0.00')
  })
  it('bows only a leg that retraces an earlier leg the other way', () => {
    expect(
      legBows([
        { from: a, to: b },
        { from: b, to: a },
        { from: a, to: b }
      ])
    ).toEqual([0, 0.14, 0])
    expect(legPathData(b, a, 0.14)).toMatch(/^M10\.00,0\.00Q/)
  })
})

describe('chevronPathData', () => {
  it('is two strokes meeting at the tip, pointing along the angle', () => {
    const d = chevronPathData({ x: 10, y: 10 }, 0, 2)
    expect(d).toBe('M8.00,8.76L10.00,10.00L8.00,11.24')
  })
})

describe('easeCalm', () => {
  it('is pinned at the ends and symmetric-ish in the middle', () => {
    expect(easeCalm(0)).toBe(0)
    expect(easeCalm(1)).toBe(1)
    const mid = easeCalm(0.5)
    expect(mid).toBeGreaterThan(0.4)
    expect(mid).toBeLessThan(0.85)
    expect(easeCalm(0.25)).toBeLessThan(easeCalm(0.5))
  })
})

describe('placeLabels', () => {
  const frame = { x: 0, y: 0, w: 100, h: 100 }
  it('puts a lone label to the right of its dot', () => {
    const [l] = placeLabels([{ x: 50, y: 50, name: 'Damascus' }], frame, 4)
    expect(l.anchor).toBe('start')
    expect(l.x).toBeGreaterThan(50)
  })
  it('moves a label left when the right would leave the frame', () => {
    const [l] = placeLabels([{ x: 96, y: 50, name: 'Damascus' }], frame, 4)
    expect(l.anchor).toBe('end')
  })
  it('keeps two labels on one row clear of each other', () => {
    const labels = placeLabels(
      [
        { x: 40, y: 50, name: 'Chaldea' },
        { x: 48, y: 50, name: 'Euphrates' }
      ],
      frame,
      4
    )
    const anchors = labels.map(l => l.anchor)
    expect(anchors).not.toEqual(['start', 'start'])
  })
  it('never drops a label', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ x: 50, y: 50 + i * 0.1, name: 'Same' }))
    expect(placeLabels(many, frame, 4)).toHaveLength(8)
  })
})

describe('inFrame', () => {
  it('respects a margin', () => {
    const vb = { x: 0, y: 0, w: 10, h: 10 }
    expect(inFrame({ x: 11, y: 5 }, vb)).toBe(false)
    expect(inFrame({ x: 11, y: 5 }, vb, 2)).toBe(true)
  })
})
