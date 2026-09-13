// Invariant tests for the built journeys data (scripts/build-journeys.mjs).
// These load the SHIPPED files straight off disk — the same two files a
// browser would fetch — rather than re-deriving anything, so a stale build
// (edited journeys.yml, forgot to re-run the build script) fails here too.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..', '..')
const JOURNEYS_PATH = resolve(ROOT, 'public', 'bible', 'map', 'journeys.json')
const PLACES_PATH = resolve(ROOT, 'public', 'map', 'places.json.gz')
const MAX_BYTES = 20 * 1024

interface JourneyLeg {
  from: string
  to: string
  ref: string
}

interface Journey {
  id: string
  title: string
  source: string
  legs: JourneyLeg[]
}

interface Gap {
  journey: string
  from: string
  to: string
  note: string
}

interface JourneysFile {
  v: number
  generated: string
  journeys: Journey[]
  gaps: Gap[]
}

function loadJourneys(): JourneysFile {
  return JSON.parse(readFileSync(JOURNEYS_PATH, 'utf8'))
}

function loadValidPlaceIds(): Set<string> {
  const bundle = JSON.parse(gunzipSync(readFileSync(PLACES_PATH)).toString('utf8')) as {
    p: { sl: string }[]
  }
  const ids = new Set<string>()
  for (const place of bundle.p) {
    const slash = place.sl.indexOf('/')
    ids.add(slash === -1 ? place.sl : place.sl.slice(slash + 1))
  }
  return ids
}

describe('journeys.json', () => {
  const journeys = loadJourneys()
  const validPlaceIds = loadValidPlaceIds()

  it('ships roughly a dozen journeys', () => {
    expect(journeys.journeys.length).toBeGreaterThanOrEqual(10)
    expect(journeys.journeys.length).toBeLessThanOrEqual(16)
  })

  it('has unique journey ids', () => {
    const ids = journeys.journeys.map(j => j.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every journey a title and at least one leg', () => {
    for (const journey of journeys.journeys) {
      expect(journey.title, `journey "${journey.id}" title`).not.toHaveLength(0)
      expect(journey.legs.length, `journey "${journey.id}" legs`).toBeGreaterThan(0)
    }
  })

  it('resolves every leg place id against the shipped place bundle', () => {
    for (const journey of journeys.journeys) {
      for (const leg of journey.legs) {
        expect(validPlaceIds.has(leg.from), `${journey.id}: unknown place id "${leg.from}"`).toBe(true)
        expect(validPlaceIds.has(leg.to), `${journey.id}: unknown place id "${leg.to}"`).toBe(true)
      }
    }
  })

  it('gives every leg a non-empty verse reference', () => {
    for (const journey of journeys.journeys) {
      for (const leg of journey.legs) {
        expect(leg.ref.trim(), `${journey.id}: ${leg.from} -> ${leg.to}`).not.toHaveLength(0)
      }
    }
  })

  it('resolves every gap against a real journey and real place ids', () => {
    const journeyIds = new Set(journeys.journeys.map(j => j.id))
    for (const gap of journeys.gaps) {
      expect(journeyIds.has(gap.journey), `gap references unknown journey "${gap.journey}"`).toBe(true)
      expect(validPlaceIds.has(gap.from), `gap: unknown place id "${gap.from}"`).toBe(true)
      expect(validPlaceIds.has(gap.to), `gap: unknown place id "${gap.to}"`).toBe(true)
      expect(gap.note.trim().length, `gap ${gap.from} -> ${gap.to} note`).toBeGreaterThan(0)
    }
  })

  it('never draws a leg it also lists as a gap', () => {
    for (const journey of journeys.journeys) {
      const legPairs = new Set(journey.legs.map(l => `${l.from}>${l.to}`))
      for (const gap of journeys.gaps.filter(g => g.journey === journey.id)) {
        expect(legPairs.has(`${gap.from}>${gap.to}`), `${journey.id}: ${gap.from} -> ${gap.to} is both a leg and a gap`).toBe(false)
      }
    }
  })

  it('stays under the 20 KB budget', () => {
    const bytes = Buffer.byteLength(readFileSync(JOURNEYS_PATH, 'utf8'), 'utf8')
    expect(bytes).toBeLessThan(MAX_BYTES)
  })
})
