// The Bible map — shapes, projection and pure logic shared by the build script
// and (later) the map itself.
//
// Slice 1 of docs/proposals/bible-map-v1.md. NOTHING in here renders: this is
// the vocabulary scripts/build-map-data.mjs bakes into the shipped bundles and
// that a later map component reads back, so the two can never drift. The build
// script imports these same functions via tsx, exactly as
// scripts/build-word-index.mjs imports src/utils/wordIndex.ts, and for the same
// reason: the projection has to be ONE implementation under test. The artwork is
// projected at build time and the place points are projected in the client — if
// those two differed by so much as a constant, every place would sit off its
// coastline and nothing would say so.
//
// Nothing below may import a Node API — this file lives under src/ and obeys the
// pure-web rule in CLAUDE.md.
import { CodedError } from '../errors'

/** `BBCCC` — zero-padded book (1–66) and chapter. OpenBible's own `sort[:5]`. */
export type ChapterKey = string

/** `BBCCCVVV` — zero-padded book, chapter and verse. OpenBible's own `sort`. */
export type VerseKey = string

/** One proposed modern location for an ancient place, best first. */
export interface PlaceCandidate {
  /** `[lon, lat]`, raw WGS84 degrees rounded to 4dp. Projection is a render decision. */
  ll: [number, number]
  /** OpenBible `score.time_total`, 0–1000: current scholarly confidence. */
  s: number
  /** The modern location's name, e.g. "Et Tell". */
  m?: string
  /** OpenBible's own precision estimate in metres. Absent where they give none. */
  p?: number
  /** `score.time_slope`: positive where confidence is rising, negative where falling. */
  tr?: number
  /** The coordinate's own citation, `[type, id]`, e.g. `["wikidata", "Q337141"]`. */
  cs?: [string, string]
}

/** An ancient place. `c` is EMPTY for the 7 places nobody can locate. */
export interface MapPlace {
  /** OpenBible `friendly_id`, e.g. "Ai 1". */
  n: string
  /** Primary place type, e.g. "settlement". */
  t: string
  /** `<ancient_id>/<url_slug>` — the path part of the openbible.info place page. */
  sl: string
  /** Competing candidate locations, highest confidence first, capped at 6. */
  c: PlaceCandidate[]
  /** `score.vote_count` on the best identification. */
  vc?: number
  /** `votes.tags` on the best identification — the tally that stands in for a citation. */
  tg?: Record<string, number>
}

/** public/map/places.json.gz */
export interface MapPlaceBundle {
  v: 1
  attribution: string
  source_commit: string
  generated: string
  p: MapPlace[]
  ch: Record<ChapterKey, number[]>
  vs: Record<VerseKey, number[]>
}

/** public/map/base.json.gz — the pre-projected Natural Earth artwork. */
export interface MapBaseArtwork {
  v: 1
  attribution: string
  source_commit: string
  generated: string
  /** The lon/lat frame the paths were clipped to. */
  extent: MapExtent
  /** `[minX, minY, width, height]` — feed straight to an SVG `viewBox`. */
  viewBox: [number, number, number, number]
  /** SVG path `d` strings, in view-box units. */
  layers: { coastline: string[]; lakes: string[]; rivers: string[] }
  /** The opt-in terrain layer, or null when the build shipped vectors only. */
  terrain: MapTerrain | null
}

/** The lazily-fetched shaded-relief layer. Never part of the default payload. */
export interface MapTerrain {
  url: string
  width: number
  height: number
  bytes: number
  attribution: string
}

export interface MapExtent {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

/**
 * The "Bible world" frame, resolved with Dennis 2026-09-02 (brief section 9a).
 * Covers 4,741 of the 4,806 candidate coordinates (98.6%, re-measured
 * 2026-09-03); the ~65 outliers — Tarshish in Spain, Uphaz in the east — are a
 * render problem (edge indicators), not a reason to stretch the frame and shrink
 * the Levant, where 84% of the content sits.
 */
export const MAP_EXTENT: MapExtent = { minLon: 10, maxLon: 60, minLat: 20, maxLat: 45 }

/**
 * Lambert Conformal Conic, standard parallels 27°N/40°N, central meridian 35°E
 * (brief section 4.3). Spherical form: at this scale the ellipsoidal correction is far
 * below the 250 m precision OpenBible claims for its own points, and the sphere
 * keeps the client transform to a dozen lines with no projection library.
 */
export const MAP_PROJECTION = { sp1: 27, sp2: 40, lon0: 35, lat0: 32.5 } as const

/** The view box is 1000 units wide; height follows from the projected extent. */
export const MAP_VIEW_WIDTH = 1000

const DEG = Math.PI / 180

// LCC constants, derived once from MAP_PROJECTION.
const {
  n: LCC_N,
  F: LCC_F,
  rho0: LCC_RHO0
} = (() => {
  const p1 = MAP_PROJECTION.sp1 * DEG
  const p2 = MAP_PROJECTION.sp2 * DEG
  const n =
    Math.log(Math.cos(p1) / Math.cos(p2)) /
    Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2))
  const F = (Math.cos(p1) * Math.pow(Math.tan(Math.PI / 4 + p1 / 2), n)) / n
  const rho0 = F / Math.pow(Math.tan(Math.PI / 4 + (MAP_PROJECTION.lat0 * DEG) / 2), n)
  return { n, F, rho0 }
})()

/**
 * The LCC forward transform, on the unit sphere. Returns projected coordinates
 * in radians-of-sphere units — small numbers around zero, not screen pixels.
 * `projectToView` is what callers usually want.
 */
export function projectLonLat(lon: number, lat: number): [number, number] {
  const rho = LCC_F / Math.pow(Math.tan(Math.PI / 4 + (lat * DEG) / 2), LCC_N)
  const theta = LCC_N * (lon * DEG - MAP_PROJECTION.lon0 * DEG)
  return [rho * Math.sin(theta), LCC_RHO0 - rho * Math.cos(theta)]
}

/**
 * The projected bounding box of the extent, sampled along its four edges rather
 * than at its corners: a conic projection bows the parallels, so the top edge's
 * extreme y is at the CENTRE of the frame, not at a corner. Taking corners only
 * would clip the top of the map.
 */
function projectedBounds(extent: MapExtent, steps = 200) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const note = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const lon = extent.minLon + (extent.maxLon - extent.minLon) * f
    const lat = extent.minLat + (extent.maxLat - extent.minLat) * f
    note(...projectLonLat(lon, extent.minLat))
    note(...projectLonLat(lon, extent.maxLat))
    note(...projectLonLat(extent.minLon, lat))
    note(...projectLonLat(extent.maxLon, lat))
  }
  return { minX, minY, maxX, maxY }
}

const BOUNDS = projectedBounds(MAP_EXTENT)
const SCALE = MAP_VIEW_WIDTH / (BOUNDS.maxX - BOUNDS.minX)

/** The view box height, derived from the projected extent's aspect ratio. */
export const MAP_VIEW_HEIGHT = (BOUNDS.maxY - BOUNDS.minY) * SCALE

/** `[minX, minY, width, height]` — the SVG `viewBox` the artwork is drawn in. */
export const MAP_VIEW_BOX: [number, number, number, number] = [
  0,
  0,
  MAP_VIEW_WIDTH,
  MAP_VIEW_HEIGHT
]

/**
 * The constants behind `projectToView`, exported for ONE caller: the build
 * script's terrain warp, which needs to run the transform BACKWARDS (for each
 * output pixel, which lon/lat does it show?). The inverse itself lives in the
 * script — the client never needs it, since every interaction is "where does
 * this lon/lat go on screen", never the reverse.
 */
export const MAP_VIEW_TRANSFORM = { scale: SCALE, minX: BOUNDS.minX, maxY: BOUNDS.maxY } as const

/** The derived Lambert Conformal Conic constants. Exported for the same reason. */
export const LCC_CONSTANTS = { n: LCC_N, F: LCC_F, rho0: LCC_RHO0 } as const

/**
 * lon/lat → view-box coordinates. This is the ONE transform: the build script
 * runs it over the Natural Earth vectors, and the client runs it over each
 * place's raw coordinates. y grows downward, as SVG expects.
 */
export function projectToView(lon: number, lat: number): [number, number] {
  const [x, y] = projectLonLat(lon, lat)
  return [(x - BOUNDS.minX) * SCALE, (BOUNDS.maxY - y) * SCALE]
}

/** Whether a coordinate falls inside the frame (`margin` in degrees). */
export function withinExtent(lon: number, lat: number, margin = 0, extent = MAP_EXTENT): boolean {
  return (
    lon >= extent.minLon - margin &&
    lon <= extent.maxLon + margin &&
    lat >= extent.minLat - margin &&
    lat <= extent.maxLat + margin
  )
}

/** `chapterKey(6, 10)` → `"06010"`, matching OpenBible's `sort[:5]`. */
export function chapterKey(book: number, chapter: number): ChapterKey {
  return String(book).padStart(2, '0') + String(chapter).padStart(3, '0')
}

/** `verseKey(6, 10, 1)` → `"06010001"`, matching OpenBible's `sort`. */
export function verseKey(book: number, chapter: number, verse: number): VerseKey {
  return chapterKey(book, chapter) + String(verse).padStart(3, '0')
}

/**
 * How confident scholarship is in a place's best identification, banded on
 * OpenBible's own scale — its readme calls 500 "high confidence", and its
 * "no major dispute" records score exactly 1000 (brief sections 3.1, 3.2).
 *
 * `unknown` is a first-class band, not an error case: 7 places have no candidate
 * at all and 474 sit below OpenBible's own confidence bar. A map that rendered
 * all of these the same as Jerusalem would be lying about a third of itself.
 */
export type ConfidenceBand = 'settled' | 'high' | 'moderate' | 'low' | 'unknown'

export function confidenceBand(place: Pick<MapPlace, 'c'>): ConfidenceBand {
  const best = place.c[0]
  if (!best) return 'unknown'
  if (best.s >= 1000) return 'settled'
  if (best.s >= 750) return 'high'
  if (best.s >= 500) return 'moderate'
  return 'low'
}

/** True where more than one location is on record — 774 of 1,342 places (58%). */
export function isContested(place: Pick<MapPlace, 'c'>): boolean {
  return place.c.length > 1
}

/** The place's page on openbible.info, which publishes the per-place sources. */
export function openBibleUrl(place: Pick<MapPlace, 'sl'>): string {
  return `https://www.openbible.info/geo/ancient/${place.sl}`
}

/**
 * Ramer–Douglas–Peucker. Used at BUILD time on the Natural Earth vectors, where
 * it takes 410,957 coastline vertices down to a few thousand. It lives here
 * rather than in the script because the simplified geometry SHIPS: it is an
 * editorial transformation of someone else's data, so there is one
 * implementation of it and it is under test.
 */
export function simplifyPath(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points
  let index = 0
  let far = 0
  const [ax, ay] = points[0]
  const [bx, by] = points[points.length - 1]
  const dx = bx - ax
  const dy = by - ay
  const span = Math.hypot(dx, dy)
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]
    // Distance to the segment, degenerating to distance-to-point on a closed ring.
    const d =
      span === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / span
    if (d > far) {
      far = d
      index = i
    }
  }
  if (far <= epsilon) return [points[0], points[points.length - 1]]
  return [
    ...simplifyPath(points.slice(0, index + 1), epsilon),
    ...simplifyPath(points.slice(index), epsilon).slice(1)
  ]
}

/** `M x,y L x,y …` at the given precision. Empty for a run of fewer than 2 points. */
export function toPathData(points: [number, number][], decimals = 2): string {
  if (points.length < 2) return ''
  const round = (v: number) => Number(v.toFixed(decimals))
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join('')
}

const PLACES_URL = '/map/places.json.gz'
const BASE_URL = '/map/base.json.gz'

// Fetch + parse one bundle. Deliberately a copy of the shape in
// src/bible/self-hosted.ts, including the sniff: hosts disagree about a `.gz`.
// Vite's dev server tags it `Content-Encoding: gzip` and the browser hands us
// plain JSON; Cloudflare Pages can hand back the raw gzip stream untouched.
// Sniffing the gzip magic number (1f 8b) — which JSON, always starting with `{`
// = 0x7b, cannot collide with — is correct in both cases rather than green in
// dev and broken in production.
async function fetchGzJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url)
  if (!res.ok) {
    throw new CodedError('MAP_BUNDLE_FETCH_FAILED', `${url} ${res.status} ${res.statusText}`)
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const json = isGzip
    ? await new Response(
        new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))
      ).text()
    : new TextDecoder().decode(bytes)
  return JSON.parse(json) as T
}

let placesPromise: Promise<MapPlaceBundle> | null = null
let basePromise: Promise<MapBaseArtwork> | null = null

/**
 * Load the place bundle, once. Memoized on the PROMISE so concurrent first reads
 * share one download, the same trick SelfHostedBibleProvider uses. Nothing calls
 * this at startup: the bundles are excluded from the service-worker precache
 * (vite.config.ts) and fetched only when a map is actually opened.
 */
export function loadMapPlaces(fetchImpl: typeof fetch = fetch): Promise<MapPlaceBundle> {
  if (!placesPromise) {
    placesPromise = fetchGzJson<MapPlaceBundle>(PLACES_URL, fetchImpl).catch(err => {
      placesPromise = null
      throw err
    })
  }
  return placesPromise
}

/** Load the base artwork, once. See `loadMapPlaces`. */
export function loadMapArtwork(fetchImpl: typeof fetch = fetch): Promise<MapBaseArtwork> {
  if (!basePromise) {
    basePromise = fetchGzJson<MapBaseArtwork>(BASE_URL, fetchImpl).catch(err => {
      basePromise = null
      throw err
    })
  }
  return basePromise
}

/** Test seam: drop the memoized bundles. */
export function resetMapBundles(): void {
  placesPromise = null
  basePromise = null
}
