import { describe, expect, it, vi } from 'vitest'
import {
  chapterKey,
  confidenceBand,
  isContested,
  loadMapArtwork,
  loadMapPlaces,
  MAP_EXTENT,
  MAP_VIEW_BOX,
  MAP_VIEW_HEIGHT,
  MAP_VIEW_WIDTH,
  openBibleUrl,
  projectLonLat,
  projectToView,
  resetMapBundles,
  simplifyPath,
  toPathData,
  verseKey,
  withinExtent,
  type MapPlace
} from './mapData'

// The `Ai 1` record VERBATIM out of public/map/places.json.gz as this branch
// builds it — the worked example the brief (sections 2.2, 3.3) reasons from. Five
// competing locations scoring 522 / 75 / 28 / 9 / 9, with confidence in Et Tell
// FALLING (-4.08) and confidence in Khirbet el Maqatir RISING (+1.85). It is
// pasted rather than invented so the "we do not know" path is tested against a
// place that really is disputed. (The brief's illustration shows four candidates
// and precision 250 m; the data has five and 50 m — corrected in the brief.)
const AI: MapPlace = {
  n: 'Ai 1',
  t: 'settlement',
  sl: 'a7e13e1/ai-1',
  c: [
    { ll: [35.2611, 31.9169], s: 522, m: 'Et Tell', p: 50, tr: -4.08, cs: ['wikidata', 'Q403166'] },
    {
      ll: [35.2496, 31.9148],
      s: 75,
      m: 'Khirbet el Maqatir',
      p: 50,
      tr: 1.85,
      cs: ['daahl', '353106715']
    },
    { ll: [35.2286, 31.8975], s: 28, m: 'Khirbet Nisieh', p: 50, tr: -0.7, cs: ['iaa', '9372'] },
    { ll: [35.2704, 31.9052], s: 9, m: 'Khirbet Haiyan', p: 50, tr: 0.24, cs: ['iaa', '9417'] },
    {
      ll: [35.2464, 31.9125],
      s: 9,
      m: 'Khirbet Ibn Baraq',
      p: 150,
      tr: 0.24,
      cs: ['daahl', '353103287']
    }
  ],
  vc: 42,
  tg: {
    authority_traditional: 1,
    authority_usually: 12,
    confidence_likely: 10,
    confidence_mostlikely: 1,
    confidence_possible: 9,
    confidence_unlikely: 2,
    confidence_yes: 5,
    identified_been: 1,
    unknown: 2
  }
}

describe('index keys', () => {
  it('matches OpenBible sort keys exactly', () => {
    // "06010001" is Joshua 10:1 — the brief's worked example, and the reason no
    // named-entity recognition is needed: OpenBible's own key IS our key.
    expect(verseKey(6, 10, 1)).toBe('06010001')
    expect(chapterKey(6, 10)).toBe('06010')
    expect(verseKey(6, 10, 1).slice(0, 5)).toBe(chapterKey(6, 10))
  })

  it('zero-pads the extremes of the canon', () => {
    expect(chapterKey(1, 1)).toBe('01001')
    expect(verseKey(66, 22, 21)).toBe('66022021')
    expect(verseKey(19, 119, 105)).toBe('19119105')
  })
})

describe('projection', () => {
  it('puts the central meridian on the vertical axis', () => {
    // On the central meridian the LCC x is exactly 0 by construction.
    expect(projectLonLat(35, 31.78)[0]).toBeCloseTo(0, 12)
    expect(projectToView(35, 31.78)[0]).toBeCloseTo(MAP_VIEW_WIDTH / 2, 6)
  })

  it('is symmetric about the central meridian', () => {
    const [xw, yw] = projectToView(25, 33)
    const [xe, ye] = projectToView(45, 33)
    expect(xw + xe).toBeCloseTo(MAP_VIEW_WIDTH, 6)
    expect(yw).toBeCloseTo(ye, 9)
  })

  it('fills the view box with the extent, north up and west left', () => {
    const north = projectToView(35, MAP_EXTENT.maxLat)
    const south = projectToView(35, MAP_EXTENT.minLat)
    expect(north[1]).toBeLessThan(south[1])
    expect(projectToView(MAP_EXTENT.minLon, 33)[0]).toBeLessThan(
      projectToView(MAP_EXTENT.maxLon, 33)[0]
    )
    // The conic bows the parallels, so the frame's extremes are on its edges,
    // not only at its corners — the view box has to contain all of them.
    for (let lon = MAP_EXTENT.minLon; lon <= MAP_EXTENT.maxLon; lon += 1) {
      for (const lat of [MAP_EXTENT.minLat, MAP_EXTENT.maxLat]) {
        const [x, y] = projectToView(lon, lat)
        expect(x).toBeGreaterThanOrEqual(-1e-6)
        expect(x).toBeLessThanOrEqual(MAP_VIEW_WIDTH + 1e-6)
        expect(y).toBeGreaterThanOrEqual(-1e-6)
        expect(y).toBeLessThanOrEqual(MAP_VIEW_HEIGHT + 1e-6)
      }
    }
  })

  it('preserves shape better than plain lon/lat would', () => {
    // The failure mode the projection exists to avoid: equirectangular stretches
    // this region horizontally by ~1/cos(31.8) ≈ 1.18. A degree of longitude at
    // Jerusalem's latitude must come out SHORTER than a degree of latitude.
    const dx = projectToView(36, 31.78)[0] - projectToView(35, 31.78)[0]
    const dy = projectToView(35, 31.78)[1] - projectToView(35, 32.78)[1]
    expect(dx).toBeLessThan(dy)
    expect(dx / dy).toBeCloseTo(Math.cos(31.78 * (Math.PI / 180)), 2)
  })

  it('reports a view box matching its own width and height', () => {
    expect(MAP_VIEW_BOX).toEqual([0, 0, MAP_VIEW_WIDTH, MAP_VIEW_HEIGHT])
  })
})

describe('withinExtent', () => {
  it('accepts Jerusalem and rejects the far outliers', () => {
    expect(withinExtent(35.2298, 31.7784)).toBe(true) // Jerusalem
    expect(withinExtent(44.0, 30.96)).toBe(true) // Ur
    expect(withinExtent(-6.0, 36.5)).toBe(false) // Tarshish 2, in Spain
    expect(withinExtent(102.0, 30.0)).toBe(false) // Uphaz, the eastern extreme
  })

  it('applies the clip margin the artwork build uses', () => {
    expect(withinExtent(9, 33)).toBe(false)
    expect(withinExtent(9, 33, 2)).toBe(true)
  })
})

describe('confidence', () => {
  it('bands Ai as low — its best identification scores 522 of 1000', () => {
    // 522 clears OpenBible's own 500 "high confidence" bar only just, and three
    // rival locations remain on record. `moderate`, never `settled`.
    expect(confidenceBand(AI)).toBe('moderate')
    expect(isContested(AI)).toBe(true)
  })

  it('bands a settled place and an unlocated one differently', () => {
    expect(confidenceBand({ c: [{ ll: [35.23, 31.78], s: 1000 }] })).toBe('settled')
    expect(confidenceBand({ c: [{ ll: [35.23, 31.78], s: 800 }] })).toBe('high')
    expect(confidenceBand({ c: [{ ll: [35.23, 31.78], s: 499 }] })).toBe('low')
    // Nod, Azazel and the other five: no candidate at all. `unknown` is a band,
    // not a missing value — the map must be able to say "we do not know".
    expect(confidenceBand({ c: [] })).toBe('unknown')
    expect(isContested({ c: [] })).toBe(false)
  })

  it('links out to the page that does publish the sources', () => {
    // votes.sources is empty for all 2,842 identifications that carry votes, so
    // the bundle cannot cite a book. It links to the place page instead.
    expect(openBibleUrl(AI)).toBe('https://www.openbible.info/geo/ancient/a7e13e1/ai-1')
  })
})

describe('simplifyPath', () => {
  it('keeps the endpoints and drops points inside the tolerance', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 0.05],
      [2, 0],
      [3, 0]
    ]
    expect(simplifyPath(line, 0.5)).toEqual([
      [0, 0],
      [3, 0]
    ])
  })

  it('keeps a point that carries the shape', () => {
    const bay: [number, number][] = [
      [0, 0],
      [1, 5],
      [2, 0]
    ]
    expect(simplifyPath(bay, 0.5)).toEqual(bay)
  })

  it('leaves short runs alone', () => {
    const pair: [number, number][] = [
      [0, 0],
      [1, 1]
    ]
    expect(simplifyPath(pair, 100)).toEqual(pair)
  })

  it('does not collapse a closed ring to nothing', () => {
    // First and last point coincide, so the "distance to the segment" degenerates
    // to distance-to-point. Getting this wrong silently deletes every island.
    const ring: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0]
    ]
    expect(simplifyPath(ring, 0.5).length).toBeGreaterThan(3)
  })
})

describe('toPathData', () => {
  it('emits SVG path data at 2 decimals', () => {
    expect(
      toPathData([
        [1.234, 2.345],
        [3.456, 4.567]
      ])
    ).toBe('M1.23,2.35L3.46,4.57')
  })

  it('emits nothing for a run too short to draw', () => {
    expect(toPathData([[1, 1]])).toBe('')
    expect(toPathData([])).toBe('')
  })
})

describe('lazy loading', () => {
  const gzipped = async (value: unknown) => {
    const stream = new Response(JSON.stringify(value)).body!.pipeThrough(
      new CompressionStream('gzip')
    )
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  it('decompresses a gzip body and memoizes the download', async () => {
    resetMapBundles()
    const bytes = await gzipped({ v: 1, p: [AI] })
    const fetchImpl = vi.fn(async () => new Response(bytes))
    const first = await loadMapPlaces(fetchImpl as unknown as typeof fetch)
    const second = await loadMapPlaces(fetchImpl as unknown as typeof fetch)
    expect(first.p[0].n).toBe('Ai 1')
    expect(second).toBe(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('/map/places.json.gz')
  })

  it('accepts plain JSON when the host already decompressed it', async () => {
    // Vite's dev server tags the .gz `Content-Encoding: gzip`, so the browser
    // hands back plain text. Sniffing the bytes, not the headers, is what makes
    // this work in dev AND on Cloudflare Pages.
    resetMapBundles()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ v: 1, layers: {} })))
    const artwork = await loadMapArtwork(fetchImpl as unknown as typeof fetch)
    expect(artwork.v).toBe(1)
  })

  it('does not memoize a failure', async () => {
    resetMapBundles()
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    // The code IS the message (src/errors.ts) — the URL and status stay on the
    // device in the private detail, where telemetry cannot reach them.
    await expect(loadMapPlaces(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      'MAP_BUNDLE_FETCH_FAILED'
    )
    await expect(loadMapPlaces(fetchImpl as unknown as typeof fetch)).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
