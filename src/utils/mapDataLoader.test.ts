import { describe, expect, it } from 'vitest'
import {
  buildViewModel,
  countVersesByPlace,
  describeMarker,
  pickMarker,
  selectLabels,
  type PlaceMarker
} from './mapDataLoader'
import { projectToView, type MapPlace } from './mapData'

// Real records out of public/map/places.json.gz, pasted rather than invented so
// the honesty rules are tested against places that really are settled, really
// are contested, and really are unlocatable.
const JERUSALEM: MapPlace = {
  n: 'Jerusalem',
  t: 'settlement',
  sl: 'a15257a/jerusalem',
  c: [{ ll: [35.2342, 31.7767], s: 1000, m: 'Jerusalem', p: 250 }],
  vc: 1
}

const AI: MapPlace = {
  n: 'Ai 1',
  t: 'settlement',
  sl: 'a7e13e1/ai-1',
  c: [
    { ll: [35.2611, 31.9169], s: 522, m: 'Et Tell', p: 50, tr: -4.08 },
    { ll: [35.2496, 31.9148], s: 75, m: 'Khirbet el Maqatir', p: 50, tr: 1.85 },
    { ll: [35.2286, 31.8975], s: 28, m: 'Khirbet Nisieh', p: 50 }
  ],
  vc: 42
}

const NOD: MapPlace = { n: 'Nod', t: 'region', sl: 'a000nod/nod', c: [] }

const BUNDLE = { p: [JERUSALEM, AI, NOD] }

describe('buildViewModel', () => {
  it('projects the best candidate with the same transform the artwork was built with', () => {
    const { markers } = buildViewModel(BUNDLE)
    const [x, y] = projectToView(35.2342, 31.7767)
    expect(markers[0].point.x).toBe(x)
    expect(markers[0].point.y).toBe(y)
  })

  it('never plots a place with no candidate — it lists it instead', () => {
    const { markers, unlocated } = buildViewModel(BUNDLE)
    expect(markers.map(m => m.name)).toEqual(['Jerusalem', 'Ai 1'])
    expect(unlocated).toEqual([{ index: 2, name: 'Nod', type: 'region' }])
  })

  it('bands confidence and flags a contested place, with its rivals kept', () => {
    const { markers } = buildViewModel(BUNDLE)
    const [jerusalem, ai] = markers
    expect(jerusalem.band).toBe('settled')
    expect(jerusalem.contested).toBe(false)
    expect(jerusalem.alternatives).toEqual([])
    expect(ai.band).toBe('moderate')
    expect(ai.contested).toBe(true)
    // Every rival survives — dropping Khirbet el Maqatir is exactly the false
    // certainty the brief's section 3.3 rule 2 forbids.
    expect(ai.alternatives.map(a => a.modern)).toEqual(['Khirbet el Maqatir', 'Khirbet Nisieh'])
  })

  it('counts every band, including the places it does not draw', () => {
    const { counts } = buildViewModel(BUNDLE)
    expect(counts).toEqual({ settled: 1, high: 0, moderate: 1, low: 0, unknown: 1 })
  })

  it('keeps the bundle index as the key, so an unlocated place does not shift it', () => {
    const { markers } = buildViewModel({ p: [NOD, JERUSALEM] })
    expect(markers[0].index).toBe(1)
  })
})

function marker(name: string, x: number, y: number, score: number): PlaceMarker {
  return {
    index: name.length,
    name,
    type: 'settlement',
    band: 'settled',
    contested: false,
    point: { x, y, score },
    alternatives: [],
    score,
    references: 0
  }
}

describe('selectLabels', () => {
  it('gives the space to the more confident place when two labels collide', () => {
    const labels = selectLabels([marker('Faint', 100, 100, 40), marker('Sure', 101, 100, 1000)])
    expect(labels.map(l => l.name)).toEqual(['Sure'])
  })

  it('labels both when they are far enough apart', () => {
    const labels = selectLabels([marker('Sure', 100, 100, 1000), marker('Faint', 100, 400, 40)])
    expect(labels.map(l => l.name).sort()).toEqual(['Faint', 'Sure'])
  })

  it('breaks ties on name, so the same data always labels the same places', () => {
    const a = selectLabels([marker('Beta', 10, 10, 500), marker('Alpha', 11, 10, 500)])
    const b = selectLabels([marker('Alpha', 11, 10, 500), marker('Beta', 10, 10, 500)])
    expect(a).toEqual(b)
    expect(a.map(l => l.name)).toEqual(['Alpha'])
  })

  it('honours the cap, keeping the most confident labels', () => {
    const many = [marker('One', 0, 0, 10), marker('Two', 0, 100, 900), marker('Three', 0, 200, 500)]
    expect(selectLabels(many, { limit: 2 }).map(l => l.name)).toEqual(['Two', 'Three'])
  })

  it('labels the most-referenced place first, before the most confident', () => {
    const jerusalem = { ...marker('Jerusalem', 100, 100, 1000), references: 800 }
    const angle = { ...marker('Angle', 100.4, 100, 1113), references: 1 }
    expect(selectLabels([angle, jerusalem]).map(l => l.name)).toEqual(['Jerusalem'])
  })

  it('does not mutate the markers it was handed', () => {
    const markers = [marker('Second', 0, 0, 1), marker('First', 0, 100, 900)]
    selectLabels(markers)
    expect(markers.map(m => m.name)).toEqual(['Second', 'First'])
  })
})

describe('describeMarker', () => {
  it('says the confidence out loud, for a reader who cannot see the shape', () => {
    const { markers } = buildViewModel(BUNDLE)
    expect(describeMarker(markers[0])).toBe(
      'Jerusalem — Undisputed (1000/1000); identified as Jerusalem'
    )
  })

  it('names the disagreement on a contested place', () => {
    const { markers } = buildViewModel(BUNDLE)
    expect(describeMarker(markers[1])).toBe(
      'Ai 1 — Moderate confidence (522/1000); identified as Et Tell; 2 competing locations also proposed'
    )
  })
})

describe('rival tethers', () => {
  it('ties a nearby rival to the winner and leaves a far one untethered', () => {
    const far: MapPlace = {
      n: 'Tarshish 2',
      t: 'region',
      sl: 'a/tarshish-2',
      c: [
        { ll: [35.0, 32.0], s: 300 },
        { ll: [35.2, 32.1], s: 200 },
        { ll: [-5.9, 36.1], s: 100 }
      ]
    }
    const { markers } = buildViewModel({ p: [far] })
    expect(markers[0].alternatives.map(a => a.linked)).toEqual([true, false])
    // Both rivals are still DRAWN — only the tether is dropped.
    expect(markers[0].alternatives).toHaveLength(2)
  })
})

describe('countVersesByPlace', () => {
  it('counts the verses each place appears in, by bundle index', () => {
    const counts = countVersesByPlace({
      '01012001': [0, 3],
      '01012002': [0],
      '43001028': [7]
    })
    expect(counts.get(0)).toBe(2)
    expect(counts.get(3)).toBe(1)
    expect(counts.get(7)).toBe(1)
    expect(counts.get(9)).toBeUndefined()
  })
})

describe('pickMarker', () => {
  const at = (index: number, x: number, y: number, references = 1, score = 500): PlaceMarker => ({
    index,
    name: `P${index}`,
    type: 'settlement',
    band: 'moderate',
    contested: false,
    point: { x, y, score },
    alternatives: [],
    score,
    references
  })

  it('returns the nearest marker within the radius', () => {
    const markers = [at(0, 10, 10), at(1, 14, 10), at(2, 40, 40)]
    expect(pickMarker(markers, { x: 13, y: 10 }, 5)?.index).toBe(1)
  })

  it('returns null when nothing is within reach', () => {
    expect(pickMarker([at(0, 10, 10)], { x: 30, y: 30 }, 5)).toBeNull()
  })

  it('treats places within the tolerance as a dead heat and picks the most-referenced', () => {
    // "The Angle" (1 verse, score 1113) is geocoded on top of Jerusalem (800 verses).
    const markers = [at(0, 10, 10, 1, 1113), at(1, 10.4, 10, 800, 1000)]
    expect(pickMarker(markers, { x: 10, y: 10 }, 5, 1)?.index).toBe(1)
    // With no tolerance, the nearer one simply wins.
    expect(pickMarker(markers, { x: 10, y: 10 }, 5, 0)?.index).toBe(0)
  })

  it('falls back to confidence when references tie', () => {
    const markers = [at(0, 10, 10, 3, 300), at(1, 10.4, 10, 3, 1000)]
    expect(pickMarker(markers, { x: 10, y: 10 }, 5, 1)?.index).toBe(1)
  })

  it('picks the village when the tap is squarely on it and it stands apart', () => {
    const markers = [at(0, 10, 10, 1, 300), at(1, 30, 10, 800, 1000)]
    expect(pickMarker(markers, { x: 10.1, y: 10 }, 5, 1)?.index).toBe(0)
  })
})
