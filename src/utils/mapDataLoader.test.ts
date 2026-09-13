import { describe, expect, it } from 'vitest'
import {
  buildJourneyRoute,
  buildViewModel,
  countVersesByPlace,
  describeMarker,
  displayPlaceName,
  findJourneyForChapter,
  indexMarkersByPlaceId,
  journeyBadges,
  journeyDoorLabel,
  pickMarker,
  placeJourneyLabels,
  referenceChapters,
  selectLabels,
  type PlaceMarker
} from './mapDataLoader'
import { projectToView, type Journey, type JourneyGap, type MapPlace } from './mapData'

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

/* ── Journeys (slice 5) ────────────────────────────────────────────────────
   The route is the one place the map ASSERTS something about the text, so the
   ordering is tested with the real Galatians journey: a route that doubles
   back on itself (Damascus twice) and ends in a gap the text is silent about. */

const GALATIANS: Journey = {
  id: 'paul-galatians-account',
  title: 'Paul: Damascus, Arabia and Jerusalem',
  source: 'Galatians 1:15-2:1',
  legs: [
    { from: 'damascus', to: 'arabia-2', ref: 'Galatians 1:17' },
    { from: 'arabia-2', to: 'damascus', ref: 'Galatians 1:17' },
    { from: 'damascus', to: 'jerusalem', ref: 'Galatians 1:17-18' },
    { from: 'jerusalem', to: 'syria-2', ref: 'Galatians 1:18-21' },
    { from: 'syria-2', to: 'cilicia', ref: 'Galatians 1:21' }
  ]
}

const GAPS: JourneyGap[] = [
  {
    journey: 'paul-galatians-account',
    from: 'cilicia',
    to: 'jerusalem',
    note: 'Galatians 2:1 names no starting point for the journey up to Jerusalem.'
  },
  { journey: 'somebody-else', from: 'a', to: 'b', note: 'not this journey' }
]

// A stand-in for the place bundle: a marker per id, at made-up but distinct
// points — except Syria, which really does sit on Damascus in the real data.
const POINTS: Record<string, [number, number]> = {
  damascus: [600, 200],
  'arabia-2': [560, 320],
  jerusalem: [520, 280],
  'syria-2': [600, 200],
  cilicia: [480, 140]
}
const stopMarker = (id: string, index: number, name: string): PlaceMarker => ({
  index,
  name,
  type: 'settlement',
  band: 'settled',
  contested: false,
  point: { x: POINTS[id][0], y: POINTS[id][1], score: 1000 },
  alternatives: [],
  score: 1000,
  references: 1
})
const MARKERS: Record<string, PlaceMarker> = {
  damascus: stopMarker('damascus', 10, 'Damascus'),
  'arabia-2': stopMarker('arabia-2', 11, 'Arabia 2'),
  jerusalem: stopMarker('jerusalem', 12, 'Jerusalem'),
  'syria-2': stopMarker('syria-2', 13, 'Syria 2'),
  cilicia: stopMarker('cilicia', 14, 'Cilicia')
}
const lookup = (id: string): PlaceMarker | undefined => MARKERS[id]

describe('buildJourneyRoute', () => {
  it('orders the legs as the passage reads them, doubling back where it does', () => {
    const route = buildJourneyRoute(GALATIANS, GAPS, lookup)!
    expect(route.legs.map(leg => `${leg.from.id}→${leg.to.id}`)).toEqual([
      'damascus→arabia-2',
      'arabia-2→damascus',
      'damascus→jerusalem',
      'jerusalem→syria-2',
      'syria-2→cilicia',
      'cilicia→jerusalem'
    ])
  })

  it('numbers every arrival, so a place visited twice carries both numbers', () => {
    const route = buildJourneyRoute(GALATIANS, GAPS, lookup)!
    expect(route.stops.map(stop => [stop.order, stop.name])).toEqual([
      [1, 'Damascus'],
      [2, 'Arabia'],
      [3, 'Damascus'],
      [4, 'Jerusalem'],
      [5, 'Syria'],
      [6, 'Cilicia'],
      [7, 'Jerusalem']
    ])
  })

  it('draws the trailing gap dotted, carrying its own reason, and never as a verse', () => {
    const route = buildJourneyRoute(GALATIANS, GAPS, lookup)!
    const last = route.legs[route.legs.length - 1]
    expect(last.silent).toBe(true)
    expect(last.ref).toBeNull()
    expect(last.note).toContain('names no starting point')
    // Every OTHER leg is stated by a verse.
    expect(route.legs.slice(0, -1).every(leg => !leg.silent && leg.ref)).toBe(true)
  })

  it('splices a gap in the MIDDLE back into reading order', () => {
    const broken: Journey = {
      id: 'voyage',
      title: 'A voyage',
      source: 'Acts 27:1-28:16',
      legs: [
        { from: 'damascus', to: 'cilicia', ref: 'Acts 27:5' },
        { from: 'jerusalem', to: 'arabia-2', ref: 'Acts 28:12' }
      ]
    }
    const route = buildJourneyRoute(
      broken,
      [{ journey: 'voyage', from: 'cilicia', to: 'jerusalem', note: 'a storm, no course' }],
      lookup
    )!
    expect(route.legs.map(leg => [`${leg.from.id}→${leg.to.id}`, leg.silent])).toEqual([
      ['damascus→cilicia', false],
      ['cilicia→jerusalem', true],
      ['jerusalem→arabia-2', false]
    ])
  })

  it('draws a discontinuity with NO gap record dotted rather than as a confident line', () => {
    const route = buildJourneyRoute(
      {
        id: 'sloppy',
        title: 'Sloppy',
        source: 'Acts 1:1',
        legs: [
          { from: 'damascus', to: 'cilicia', ref: 'Acts 1:1' },
          { from: 'jerusalem', to: 'arabia-2', ref: 'Acts 1:2' }
        ]
      },
      [],
      lookup
    )!
    const spliced = route.legs[1]
    expect(spliced.silent).toBe(true)
    expect(spliced.note).toBeNull()
  })

  it('names a place nobody can locate rather than drawing it somewhere', () => {
    const route = buildJourneyRoute(
      {
        id: 'unlocated',
        title: 'Unlocated',
        source: 'Genesis 4:16',
        legs: [
          { from: 'damascus', to: 'nod', ref: 'Genesis 4:16' },
          { from: 'damascus', to: 'jerusalem', ref: 'Genesis 4:17' }
        ]
      },
      [],
      lookup
    )!
    expect(route.unlocated).toEqual(['nod'])
    expect(route.legs.map(leg => `${leg.from.id}→${leg.to.id}`)).toEqual(['damascus→jerusalem'])
  })
})

describe('journeyBadges', () => {
  it('gives a place ONE badge carrying every visit it receives', () => {
    const route = buildJourneyRoute(GALATIANS, GAPS, lookup)!
    const badges = journeyBadges(route.stops)
    expect(badges.map(b => b.orders)).toEqual([[1, 3], [2], [4, 7], [5], [6]])
  })

  it('nudges a badge off one already sitting on the same point', () => {
    const route = buildJourneyRoute(GALATIANS, GAPS, lookup)!
    const badges = journeyBadges(route.stops, 17)
    // Syria really is geocoded on Damascus; the two badges must not stack.
    const damascus = badges.find(b => b.index === 10)!
    const syria = badges.find(b => b.index === 13)!
    expect(damascus.x).toBe(syria.x)
    expect(damascus.y).toBe(syria.y)
    expect(syria.offset).toBe(17)
    expect(damascus.offset).toBe(0)
  })
})

describe('placeJourneyLabels', () => {
  it('names every stop once, even where two stops share a coordinate', () => {
    const route = buildJourneyRoute(GALATIANS, GAPS, lookup)!
    const labels = placeJourneyLabels(route.stops, { charWidth: 4, lineHeight: 8, offsetX: 5 })
    expect(labels.map(l => l.name)).toEqual(['Damascus', 'Arabia', 'Jerusalem', 'Syria', 'Cilicia'])
  })

  it('moves a colliding label instead of dropping it', () => {
    const stops = [
      { order: 1, id: 'a', name: 'Damascus', index: 1, x: 100, y: 100 },
      { order: 2, id: 'b', name: 'Syria', index: 2, x: 100, y: 100 }
    ]
    const labels = placeJourneyLabels(stops, { charWidth: 4, lineHeight: 8, offsetX: 5 })
    expect(labels).toHaveLength(2)
    // Same dot, so the second name has to be somewhere else: other side, or
    // another line — never the same box.
    expect(labels[0].x === labels[1].x && labels[0].y === labels[1].y).toBe(false)
  })
})

describe('referenceChapters', () => {
  it('reads a single verse, a range, and a range that crosses chapters', () => {
    expect(referenceChapters('Galatians 1:17')).toEqual(['48001'])
    expect(referenceChapters('Galatians 1:15-2:1')).toEqual(['48001', '48002'])
    expect(referenceChapters('Numbers 33:5-49')).toEqual(['04033'])
  })

  it('reads several parts, carrying the book name forward when a part drops it', () => {
    expect(referenceChapters('Luke 9:51; 17:11-19:41')).toEqual([
      '42009',
      '42017',
      '42018',
      '42019'
    ])
    expect(referenceChapters('2 Kings 25:1-21; Ezra 1:1-11')).toEqual(['12025', '15001'])
  })

  it('ignores what it cannot read rather than guessing a book', () => {
    expect(referenceChapters('Somewhere 1:1')).toEqual([])
    expect(referenceChapters('')).toEqual([])
  })
})

describe('findJourneyForChapter', () => {
  const bundle = { journeys: [GALATIANS] }

  it('finds the journey from any chapter it travels through', () => {
    expect(findJourneyForChapter(bundle, 48, 1)?.id).toBe('paul-galatians-account')
    expect(findJourneyForChapter(bundle, 48, 2)?.id).toBe('paul-galatians-account')
  })

  it('finds nothing for a chapter with no journey', () => {
    expect(findJourneyForChapter(bundle, 48, 3)).toBeNull()
    expect(findJourneyForChapter(bundle, 1, 1)).toBeNull()
  })
})

describe('journeyDoorLabel', () => {
  it('says whose route it is when the title names a subject', () => {
    expect(journeyDoorLabel(GALATIANS)).toBe('Follow Paul’s route')
    expect(journeyDoorLabel({ title: 'Abram: from Ur to Canaan' })).toBe('Follow Abram’s route')
  })

  it('falls back rather than inventing a possessive', () => {
    expect(journeyDoorLabel({ title: 'The Exodus, station by station' })).toBe('Follow the route')
  })
})

describe('displayPlaceName', () => {
  it('drops OpenBible’s disambiguating suffix, which reads as a stop number', () => {
    expect(displayPlaceName('Arabia 2')).toBe('Arabia')
    expect(displayPlaceName('Jerusalem')).toBe('Jerusalem')
  })
})

describe('indexMarkersByPlaceId', () => {
  it('keys markers by the id the journeys file uses — the slug, not the name', () => {
    const { markers } = buildViewModel(BUNDLE)
    const byId = indexMarkersByPlaceId(markers, BUNDLE)
    expect(byId.get('jerusalem')?.name).toBe('Jerusalem')
    expect(byId.get('ai-1')?.name).toBe('Ai 1')
    // Nod has no location, so it is not a marker and cannot be a stop.
    expect(byId.get('nod')).toBeUndefined()
  })
})
