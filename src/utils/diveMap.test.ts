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

// ── context landmarks (2026-10-28): the place-only card frames a few known names ──
import { CONTEXT_FRAME, chooseLandmarks, JERUSALEM_REACH, LANDMARK_NAMES } from './diveMap'

describe('chooseLandmarks', () => {
  // Real view-unit positions from the shipped projection, rounded.
  const L = {
    jerusalem: { x: 504, y: 324, name: 'Jerusalem' },
    damascus: { x: 523, y: 287, name: 'Damascus' },
    nineveh: { x: 637, y: 222, name: 'Nineveh' },
    babylon: { x: 666, y: 300, name: 'Babylon' },
    haran: { x: 568, y: 216, name: 'Haran' },
    memphis: { x: 432, y: 363, name: 'Memphis' },
    sinai: { x: 481, y: 391, name: 'Mount Sinai' },
    rome: { x: 148, y: 73, name: 'Rome' },
    bethlehem: { x: 504, y: 325, name: 'Bethlehem' },
    hebron: { x: 502, y: 329, name: 'Hebron' }
  }
  const all = Object.values(L)
  const ararat = { x: 650, y: 151 }

  it('gives Ararat three to four references, Jerusalem among them, never itself', () => {
    const out = chooseLandmarks([ararat], all)
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(out.length).toBeLessThanOrEqual(4)
    expect(out.map(l => l.name)).toContain('Jerusalem')
    expect(out.map(l => l.name)).toContain('Nineveh')
  })
  it('spreads the picks around the chapter rather than lining them up', () => {
    const out = chooseLandmarks([ararat], all)
    // Nineveh and Haran are both south-west of Ararat; only one of them makes
    // the first pass, so Babylon (south) gets in ahead of the other.
    expect(out.map(l => l.name)).toContain('Babylon')
  })
  it('leaves Jerusalem out beyond its reach, and never picks a chapter place', () => {
    // From Rome, Jerusalem is not forced in: with one slot the nearest wins.
    const one = chooseLandmarks([{ x: 148, y: 73 }], all, { count: 1 })
    expect(one.map(l => l.name)).toEqual(['Memphis'])
    expect(chooseLandmarks([{ x: 148, y: 73 }], all).map(l => l.name)).not.toContain('Rome')
    // From Ararat it is, even though five others are nearer.
    expect(chooseLandmarks([ararat], all, { count: 1 }).map(l => l.name)).toEqual(['Jerusalem'])
    expect(chooseLandmarks([L.jerusalem], all, { jerusalemReach: JERUSALEM_REACH })).not.toContain(
      L.jerusalem
    )
  })
  it('is empty with nothing to orient or nothing to orient by', () => {
    expect(chooseLandmarks([], all)).toEqual([])
    expect(chooseLandmarks([ararat], [])).toEqual([])
  })
  it('honours the count and is stable in order', () => {
    const a = chooseLandmarks([ararat], all, { count: 3 })
    expect(a).toHaveLength(3)
    expect(chooseLandmarks([ararat], all, { count: 3 })).toEqual(a)
  })
  it('ships a landmark list and a wider frame than the bare chapter frame', () => {
    expect(LANDMARK_NAMES).toContain('Jerusalem')
    expect(new Set(LANDMARK_NAMES).size).toBe(LANDMARK_NAMES.length)
    expect(CONTEXT_FRAME.minSpan).toBeGreaterThan(60)
  })
})
